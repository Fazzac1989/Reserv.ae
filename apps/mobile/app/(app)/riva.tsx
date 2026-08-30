import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Screen } from '../../src/components/ui/screen';
import { Button } from '../../src/components/ui/button';
import { Body, Display, Lead, Meta, Muted } from '../../src/components/ui/text';
import { VenueCard } from '../../src/components/venue-card';
import { VenueSheet } from '../../src/components/venue-sheet';
import { LiveStatus } from '../../src/components/booking-state';
import { Confirmation } from '../../src/components/confirmation';
import { statusCopy } from '../../src/components/reservation-card';
import { addToCalendar } from '../../src/lib/calendar';
import { openDirections } from '../../src/lib/directions';
import {
  approveSuggestion,
  getCapabilities,
  listReservations,
  requestSuggestions,
  saveCalendarEventId,
  sendConciergeMessage,
  transcribeVoiceNote,
  type ConciergeReply,
  type SuggestionCard,
} from '../../src/lib/agent';
import { uploadVoiceNote } from '../../src/lib/voice-note';
import { useProfile } from '../../src/lib/profile';
import { useSession } from '../../src/store/session';

/**
 * The conversation is the app.
 *
 * One scrolling thread, one input, and a single word in the corner for the
 * bookings already made. No tab bar, no dashboard, no cards linking to other
 * cards — a concierge is someone you talk to, and every piece of navigation
 * added here would be a piece of the illusion taken away.
 */

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  party_size: 'party size',
  zones: 'area',
  price_band_max: 'budget',
};

function assumptionNote(reply: ConciergeReply): string | null {
  if (reply.defaulted.length === 0) return null;
  const parts = reply.defaulted.map((f) => DEFAULT_LABELS[f] ?? f);
  return `Assumed your usual ${parts.join(' and ')} — say if that is wrong.`;
}

function firstName(full: string | null): string | null {
  if (!full) return null;
  return full.trim().split(/\s+/)[0] ?? null;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Conversation() {
  // Home hands over whatever was typed there, so the question is asked once
  // and answered in the one place a conversation lives.
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  const session = useSession();
  const profile = useProfile();
  const scrollRef = useRef<ScrollView>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<{
    text: string;
    audioRef: string;
    confidence: number | null;
  } | null>(null);
  const [cards, setCards] = useState<SuggestionCard[]>([]);
  const [opened, setOpened] = useState<SuggestionCard | null>(null);
  /**
   * The booking being waited on.
   *
   * Approving starts the work; it does not finish it. Nothing here says
   * confirmed until the venue has actually said so, which is the difference
   * between this product and a form that emails a restaurant.
   */
  const [watching, setWatching] = useState<string | null>(null);

  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: getCapabilities });

  // Only while something is outstanding. A venue answering is the one event
  // worth watching for, and it arrives on someone else's schedule.
  const watched = useQuery({
    queryKey: ['reservations'],
    queryFn: listReservations,
    enabled: watching !== null,
    refetchInterval: watching === null ? false : 4000,
  });

  const booking =
    watching === null
      ? null
      : ([...(watched.data?.upcoming ?? []), ...(watched.data?.past ?? [])].find(
          (r) => r.id === watching,
        ) ?? null);
  const settled = booking !== null && booking.confirmed_at !== null;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const handedOver = useRef<string | null>(null);

  useEffect(() => {
    // Once per handover. The parameter survives a re-render and would
    // otherwise ask the same question every time this screen updates.
    if (typeof ask === 'string' && ask.trim() && handedOver.current !== ask) {
      handedOver.current = ask;
      submitText(ask);
    }
  });

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, [turns.length, cards.length, settled, watching, pendingTranscript]);

  const send = useMutation({
    mutationFn: (input: { text: string; audioRef?: string; confidence?: number | null }) =>
      sendConciergeMessage({
        conversationId,
        text: input.text,
        ...(input.audioRef ? { audioRef: input.audioRef } : {}),
        ...(typeof input.confidence === 'number' ? { transcriptConfidence: input.confidence } : {}),
      }),
    onSuccess: (reply) => {
      setConversationId(reply.conversationId);
      setTurns((t) => [
        ...t,
        { id: `${reply.requestId}-assistant`, role: 'assistant', content: reply.reply },
      ]);
      setNote(assumptionNote(reply));
      if (reply.ready) suggest.mutate(reply.requestId);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Something went wrong.'),
  });

  const suggest = useMutation({
    mutationFn: (requestId: string) => requestSuggestions(requestId),
    // Three at most. A concierge with an opinion offers a shortlist, not a
    // directory.
    onSuccess: (result) => {
      setCards(result.suggestions.slice(0, 3));
      if (result.suggestions.length === 0 && result.message) {
        setTurns((t) => [
          ...t,
          { id: `${Date.now()}-none`, role: 'assistant', content: result.message! },
        ]);
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not put options together.'),
  });

  const reserve = useMutation({
    mutationFn: (card: SuggestionCard) => approveSuggestion(card.id),
    onMutate: () => {
      setOpened(null);
      setCards([]);
    },
    // The booking now exists and the venue has not answered. Watching begins;
    // saying it is confirmed does not.
    onSuccess: (result) => setWatching(result.bookingId),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not put that through.'),
  });

  const calendar = useMutation({
    mutationFn: async () => {
      if (!booking) throw new Error('Nothing to add.');
      const result = await addToCalendar({
        title: `${booking.venues?.name ?? 'Reservation'} — table for ${booking.party_size}`,
        startsAt: new Date(booking.scheduled_for),
        endsAt: new Date(Date.parse(booking.scheduled_for) + 2 * 3600_000),
        location: booking.venues?.address ?? null,
        notes: booking.special_requests,
      });
      if (!result.ok) throw new Error(result.reason);
      await saveCalendarEventId(booking.id, result.eventId);
      return result.message;
    },
    onSuccess: (message) => setNote(message),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not add it.'),
  });

  function submitText(text: string, audioRef?: string, confidence?: number | null) {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setError(null);
    setNote(null);
    setWatching(null);
    setTurns((t) => [...t, { id: `${Date.now()}`, role: 'user', content: trimmed }]);
    setDraft('');
    setPendingTranscript(null);
    setCards([]);
    send.mutate({ text: trimmed, ...(audioRef ? { audioRef } : {}), confidence });
  }

  const voice = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('Sign in required.');
      const uri = recorder.uri;
      if (!uri) throw new Error('That recording came out empty.');
      const { audioRef } = await uploadVoiceNote(uri, session.user.id);
      const transcript = await transcribeVoiceNote(audioRef);
      return { audioRef, ...transcript };
    },
    onSuccess: (result) =>
      setPendingTranscript({
        text: result.text,
        audioRef: result.audioRef,
        confidence: result.confidence,
      }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not transcribe that.'),
  });

  async function toggleRecording() {
    setError(null);
    if (recorderState.isRecording) {
      await recorder.stop();
      voice.mutate();
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('I need microphone access to take a voice note.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  const name = firstName(profile.data?.full_name ?? null);
  const voiceEnabled = capabilities.data?.voice_notes === true;
  const thinking = send.isPending || suggest.isPending || voice.isPending;
  const empty = turns.length === 0 && watching === null;
  // Cards peek past the edge so it reads as a row that continues, not as one
  // card that happens to be narrow.
  const cardWidth = Math.min(Dimensions.get('window').width - 96, 300);

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerClassName="gap-7 px-7 pb-8 pt-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {empty ? (
            <Display>
              {greeting()}
              {name ? `, ${name}` : ''}
            </Display>
          ) : null}

          {turns.map((turn) =>
            turn.role === 'user' ? (
              <View key={turn.id} className="items-end">
                <View className="max-w-[82%] rounded-card bg-porcelain-raised px-5 py-3.5 dark:bg-ink-raised">
                  <Body>{turn.content}</Body>
                </View>
              </View>
            ) : (
              // The concierge is not a correspondent to be quoted. Its words
              // are simply the page.
              <Lead key={turn.id}>{turn.content}</Lead>
            ),
          )}

          {cards.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3 pr-7"
              className="-mx-7 px-7"
            >
              {cards.map((card) => (
                <VenueCard
                  key={card.id}
                  card={card}
                  width={cardWidth}
                  onPress={() => setOpened(card)}
                />
              ))}
            </ScrollView>
          ) : null}

          {/*
            While the venue has not answered, the app says what is actually
            happening — in the booking's own words, not a hopeful summary.
          */}
          {watching !== null && !settled ? (
            <LiveStatus
              label={
                reserve.isPending || booking === null
                  ? 'Putting that to them…'
                  : statusCopy(booking).detail
              }
            />
          ) : null}

          {settled && booking ? (
            <Confirmation
              reservation={booking}
              onAddToCalendar={() => calendar.mutate()}
              onDirections={
                booking.venues?.address
                  ? () =>
                      void openDirections(
                        booking.venues!.address!,
                        booking.venues!.lat,
                        booking.venues!.lng,
                      )
                  : undefined
              }
            />
          ) : null}

          {thinking && watching === null ? <LiveStatus label="One moment…" /> : null}
          {note ? <Muted>{note}</Muted> : null}
          {error ? <Body className="text-clay">{error}</Body> : null}
        </ScrollView>

        {pendingTranscript ? (
          <View className="gap-3.5 px-7 pb-5 pt-3">
            <Meta>
              I heard this
              {typeof pendingTranscript.confidence === 'number' &&
              pendingTranscript.confidence < 0.75
                ? ' — do check it'
                : ''}
            </Meta>
            <TextInput
              value={pendingTranscript.text}
              onChangeText={(text) => setPendingTranscript((p) => (p ? { ...p, text } : p))}
              multiline
              className="rounded-card border border-stone-line px-5 py-4 font-body text-lead text-ink dark:text-porcelain"
            />
            <View className="flex-row gap-2.5">
              <Button
                label="Send this"
                className="flex-1"
                onPress={() =>
                  submitText(
                    pendingTranscript.text,
                    pendingTranscript.audioRef,
                    pendingTranscript.confidence,
                  )
                }
              />
              <Button
                label="Discard"
                variant="quiet"
                className="flex-1"
                onPress={() => setPendingTranscript(null)}
              />
            </View>
          </View>
        ) : (
          <View className="gap-3 px-7 pb-5 pt-2">
            <View className="flex-row items-end gap-2.5">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask for something…"
                placeholderTextColor="#8A8D93"
                multiline
                editable={!thinking}
                returnKeyType="send"
                onSubmitEditing={() => submitText(draft)}
                className="max-h-32 flex-1 rounded-input border border-stone-line px-5 py-3.5 font-body text-lead text-ink dark:text-porcelain"
              />

              {voiceEnabled ? (
                <Pressable
                  onPress={toggleRecording}
                  disabled={thinking && !recorderState.isRecording}
                  accessibilityRole="button"
                  accessibilityLabel={
                    recorderState.isRecording ? 'Stop recording' : 'Record a voice note'
                  }
                  className={
                    recorderState.isRecording
                      ? 'h-12 w-12 items-center justify-center rounded-full bg-clay'
                      : 'h-12 w-12 items-center justify-center rounded-full border border-stone-line'
                  }
                >
                  <View
                    className={
                      recorderState.isRecording
                        ? 'h-3 w-3 bg-porcelain'
                        : 'h-3 w-3 rounded-full bg-stone'
                    }
                  />
                </Pressable>
              ) : null}

              {/*
                Appears only when there is something to send, so the resting
                state is one line and nothing else.
              */}
              {draft.trim().length > 0 ? (
                <Button
                  label="Send"
                  onPress={() => submitText(draft)}
                  loading={send.isPending}
                  className="h-12 px-5"
                />
              ) : null}
            </View>

            {empty ? <Muted>Quiet table for two tonight, walking distance</Muted> : null}

            {recorderState.isRecording ? <Muted>Recording. Tap the square when done.</Muted> : null}
          </View>
        )}
      </KeyboardAvoidingView>

      <VenueSheet
        card={opened}
        onClose={() => setOpened(null)}
        onReserve={(card) => reserve.mutate(card)}
        reserving={reserve.isPending}
      />
    </Screen>
  );
}
