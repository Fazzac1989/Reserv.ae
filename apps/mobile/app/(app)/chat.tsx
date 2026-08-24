import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
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
import { Body, Caption, Display, Eyebrow } from '../../src/components/ui/text';
import {
  approveSuggestion,
  getCapabilities,
  requestSuggestions,
  sendConciergeMessage,
  transcribeVoiceNote,
  type ConciergeReply,
  type SuggestionCard,
} from '../../src/lib/agent';
import { SuggestionCardView } from '../../src/components/suggestion-card';
import { uploadVoiceNote } from '../../src/lib/voice-note';
import { useSession } from '../../src/store/session';

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fromVoice?: boolean;
}

/** What we assumed rather than heard, rendered in the user's words. */
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

export default function Chat() {
  const router = useRouter();
  const session = useSession();
  const scrollRef = useRef<ScrollView>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** A transcript waiting to be read and corrected before it is sent. */
  const [pendingTranscript, setPendingTranscript] = useState<{
    text: string;
    audioRef: string;
    confidence: number | null;
  } | null>(null);
  const [cards, setCards] = useState<SuggestionCard[]>([]);
  const [approved, setApproved] = useState(false);

  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: getCapabilities });
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [turns.length, pendingTranscript]);

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
      // A request with everything it needs goes straight to options. Making
      // the user say "yes please" to a question they already answered is the
      // sort of thing a bad secretary does.
      if (reply.ready) suggest.mutate(reply.requestId);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Something went wrong.'),
  });

  function submitText(text: string, audioRef?: string, confidence?: number | null) {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setError(null);
    setNote(null);
    setTurns((t) => [
      ...t,
      { id: `${Date.now()}`, role: 'user', content: trimmed, fromVoice: Boolean(audioRef) },
    ]);
    setDraft('');
    setPendingTranscript(null);
    setCards([]);
    setApproved(false);
    send.mutate({ text: trimmed, ...(audioRef ? { audioRef } : {}), confidence });
  }

  const suggest = useMutation({
    mutationFn: (requestId: string) => requestSuggestions(requestId),
    onSuccess: (result) => {
      setCards(result.suggestions);
      if (result.suggestions.length === 0 && result.message) {
        setTurns((t) => [
          ...t,
          { id: `${Date.now()}-none`, role: 'assistant', content: result.message! },
        ]);
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not find options.'),
  });

  const approve = useMutation({
    mutationFn: (suggestionId: string) => approveSuggestion(suggestionId),
    onSuccess: (result) => {
      setCards([]);
      setApproved(true);
      setTurns((t) => [
        ...t,
        { id: `${result.bookingId}-approved`, role: 'assistant', content: result.message },
      ]);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not approve that.'),
  });

  const voice = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('Sign in required.');
      const uri = recorder.uri;
      if (!uri) throw new Error('That recording came out empty.');
      const { audioRef } = await uploadVoiceNote(uri, session.user.id);
      const transcript = await transcribeVoiceNote(audioRef);
      return { audioRef, ...transcript };
    },
    // The transcript is shown for the user to read and correct. Sending it
    // straight through would mean booking against words they never said.
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

  const voiceEnabled = capabilities.data?.voice_notes === true;
  const busy = send.isPending || voice.isPending || suggest.isPending || approve.isPending;

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerClassName="px-7 pb-6 pt-6 gap-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {turns.length === 0 ? (
            <View className="gap-3 pb-4">
              <Eyebrow>Concierge</Eyebrow>
              <Display>What can I get you?</Display>
              <Body>
                Tell me what you want in your own words. I will work out the details and come back
                with options.
              </Body>
            </View>
          ) : null}

          {turns.map((turn) =>
            turn.role === 'user' ? (
              <View key={turn.id} className="items-end">
                <View className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-3 dark:bg-paper">
                  <Body className="text-paper dark:text-ink">{turn.content}</Body>
                </View>
                {turn.fromVoice ? <Caption className="mt-1">voice note</Caption> : null}
              </View>
            ) : (
              <View key={turn.id} className="items-start">
                <View className="max-w-[85%] rounded-2xl rounded-bl-md border border-paper-line bg-paper-raised px-4 py-3 dark:border-night-line dark:bg-night-raised">
                  <Body className="text-ink dark:text-paper">{turn.content}</Body>
                </View>
              </View>
            ),
          )}

          {cards.length > 0 ? (
            <View className="gap-3 pt-2">
              <Caption>{cards.length === 1 ? 'One that fits' : `${cards.length} that fit`}</Caption>
              {cards.map((card) => (
                <SuggestionCardView
                  key={card.id}
                  card={card}
                  disabled={approve.isPending}
                  onApprove={() => approve.mutate(card.id)}
                />
              ))}
            </View>
          ) : null}

          {busy ? (
            <View className="items-start">
              <View className="rounded-2xl rounded-bl-md border border-paper-line px-4 py-3 dark:border-night-line">
                <ActivityIndicator />
              </View>
            </View>
          ) : null}

          {note ? <Caption>{note}</Caption> : null}

          {/*
            Said plainly, because it is the honest state of things: approving
            starts the work, it does not finish it. Nothing is confirmed until
            the venue says so.
          */}
          {approved ? (
            <Caption className="text-ink-faint">
              Nothing is held yet. I will tell you here the moment the venue confirms.
            </Caption>
          ) : null}
          {error ? <Caption className="text-danger">{error}</Caption> : null}
        </ScrollView>

        {/*
          The confirmation step. Whisper mishears names and times constantly, and
          a transcript the user has not read is not something to book against.
        */}
        {pendingTranscript ? (
          <View className="gap-3 border-t border-paper-line px-7 py-4 dark:border-night-line">
            <Caption>
              I heard this
              {typeof pendingTranscript.confidence === 'number' &&
              pendingTranscript.confidence < 0.75
                ? ' — the audio was not very clear, so do check it'
                : ''}
            </Caption>
            <TextInput
              value={pendingTranscript.text}
              onChangeText={(text) => setPendingTranscript((p) => (p ? { ...p, text } : p))}
              multiline
              className="rounded-2xl border border-paper-line bg-paper-raised px-4 py-3 text-base text-ink dark:border-night-line dark:bg-night-raised dark:text-paper"
            />
            <View className="flex-row gap-2">
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
                variant="secondary"
                className="flex-1"
                onPress={() => setPendingTranscript(null)}
              />
            </View>
          </View>
        ) : (
          <View className="gap-2 border-t border-paper-line px-7 pb-4 pt-3 dark:border-night-line">
            <View className="flex-row items-end gap-2">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Book me a table for Friday…"
                placeholderTextColor="#a8a29e"
                multiline
                editable={!busy}
                onSubmitEditing={() => submitText(draft)}
                className="max-h-32 flex-1 rounded-2xl border border-paper-line bg-paper-raised px-4 py-3 text-base text-ink dark:border-night-line dark:bg-night-raised dark:text-paper"
              />

              {/*
                The microphone appears only where transcription is genuinely
                configured. A mic that records and then fails is worse than no
                mic at all.
              */}
              {voiceEnabled ? (
                <Pressable
                  onPress={toggleRecording}
                  disabled={busy && !recorderState.isRecording}
                  accessibilityRole="button"
                  accessibilityLabel={
                    recorderState.isRecording ? 'Stop recording' : 'Record a voice note'
                  }
                  className={
                    recorderState.isRecording
                      ? 'h-12 w-12 items-center justify-center rounded-full bg-danger'
                      : 'h-12 w-12 items-center justify-center rounded-full border border-paper-line dark:border-night-line'
                  }
                >
                  <View
                    className={
                      recorderState.isRecording
                        ? 'h-3 w-3 rounded-sm bg-paper'
                        : 'h-3.5 w-3.5 rounded-full bg-ink dark:bg-paper'
                    }
                  />
                </Pressable>
              ) : null}

              <Button
                label="Send"
                onPress={() => submitText(draft)}
                disabled={draft.trim().length === 0}
                loading={send.isPending}
                className="h-12 px-5"
              />
            </View>

            {recorderState.isRecording ? (
              <Caption className="text-danger">
                Recording… tap the square when you are done.
              </Caption>
            ) : null}

            {capabilities.data && !voiceEnabled ? (
              <Caption className="text-ink-faint">
                Voice notes are not switched on in this build.
              </Caption>
            ) : null}

            <Pressable onPress={() => router.back()} accessibilityRole="button" className="py-1">
              <Caption>Back</Caption>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
