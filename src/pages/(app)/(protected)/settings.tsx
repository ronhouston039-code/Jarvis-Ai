import { signOut, useUser } from "deepspace";
import { JarvisPreferences } from "../../../components/JarvisPreferences";
import { Button } from "../../../components/ui";
export default function SettingsPage() {
  const { user } = useUser();
  return (
    <div className="personal-page">
      <p className="eyebrow">YOUR ASSISTANT, YOUR WAY</p>
      <h1>Settings</h1>
      <section className="personal-card">
        <div>
          <h2 className="!mt-0">Your account</h2>
          <p>{user?.name}</p>
          <p className="muted text-sm">{user?.email}</p>
        </div>
        <Button variant="outline" onClick={() => signOut()}>
          Sign out
        </Button>
      </section>
      <h2>Personal preferences</h2>
      <JarvisPreferences />
      <h2>Voice on iPhone</h2>
      <p className="muted leading-7">
        Tap the microphone in a conversation to dictate. Review the transcript,
        then send. Tap Listen beneath a reply to request your configured Fish
        Audio voice. If Fish Audio needs credits, you can explicitly choose the
        iPhone voice fallback. If Safari dictation is unavailable, use your
        keyboard’s microphone.
      </p>
      <h2>Keep JARVIS close</h2>
      <p className="muted leading-7">
        Open this app in Safari. Tap Share, then Add to Home Screen. JARVIS
        listens only when you activate voice input; background wake-word
        listening is not enabled.
      </p>
      <h2>Connected services</h2>
      <p className="muted leading-7">
        Your account uses Groq when configured; other accounts use their own
        DeepSpace AI credits. Credentials stay encrypted on the server. Fish
        Audio API credits are separate from subscription credits. Weather,
        email, calendar, music, maps, and smart-home services are not connected
        yet. JARVIS will tell you when a request needs one.
      </p>
      <h2>Privacy</h2>
      <p className="muted leading-7">
        Conversations are sent to your selected AI provider to generate replies.
        Device dictation may use your phone’s speech service. Requests for your
        configured voice send the reply text to Fish Audio. Personal memories
        are added only when you ask. Manage and delete your data in My space.
      </p>
    </div>
  );
}
