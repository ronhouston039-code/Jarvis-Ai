import { useEffect, useState } from "react";
import { Button } from "./ui";
const speech = "Good morning, Alex. You have one meeting at eleven and three priorities: finish your presentation outline, call the dentist, and review project notes. Rain begins around five. Your first open focus block is eight thirty to ten. This is a sample briefing.";
export function BriefingPreview() {
  const [dismissed, setDismissed] = useState(false);
  const [plan, setPlan] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [afternoon, setAfternoon] = useState(true);
  const [status, setStatus] = useState("");
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  if (dismissed) return <Button variant="outline" onClick={() => setDismissed(false)}>Show briefing preview</Button>;
  return <section className="personal-card" aria-label="Daily briefing preview"><div>
    <p className="eyebrow">DAILY BRIEFING · SAMPLE PREVIEW</p>
    <Button variant="outline" onClick={() => { setAfternoon(!afternoon); setPlan(false); setShowTasks(false); }}>Preview {afternoon ? "morning" : "afternoon"}</Button>
    <h2>Good {afternoon ? "afternoon" : "morning"}, Alex.</h2>
    {afternoon ? <><p>Your afternoon is open. You have three tasks needing attention, and your presentation is due Thursday.</p><p>I found a 90-minute focus block from 3:00 to 4:30 PM. Would you like me to build a plan around it?</p></> : <>
    <p>You have one meeting at 11:00 AM and three priorities:</p>
    <ul><li>Finish presentation outline</li><li>Call the dentist</li><li>Review project notes</li></ul>
    <p>Rain begins around 5 PM.<br />Your first open focus block is 8:30–10:00 AM.</p>
    </>}
    <p className="muted">These are sample details, not your calendar or live forecast. Building this plan does not schedule appointments or change your calendar.</p>
    <div className="connection-actions">
      <Button onClick={() => setPlan(true)}>Build plan</Button>
      <Button variant="outline" onClick={() => setShowTasks(!showTasks)}>Show tasks</Button>
      <Button variant="outline" onClick={() => {
        if (!window.speechSynthesis) { setStatus("Device speech is unavailable in this browser."); return; }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(afternoon ? "Good afternoon, Alex. Your afternoon is open, with three tasks needing attention and your presentation due Thursday. Would you like a plan for three to four thirty? This is a sample briefing." : speech);
        utterance.lang = navigator.language || "en-US";
        utterance.onerror = () => setStatus("Speech could not play. Check your device volume and try again.");
        window.speechSynthesis.speak(utterance);
        setStatus("Playing the sample briefing using your device voice.");
      }}>Hear it aloud</Button>
      <Button variant="outline" onClick={() => { window.speechSynthesis?.cancel(); setDismissed(true); }}>{afternoon ? "Not now" : "Dismiss"}</Button>
    </div>
    {showTasks && <ul aria-label="Sample tasks"><li>Finish presentation outline · due Thursday</li><li>Call the dentist</li><li>Review project notes</li></ul>}
    {plan && <div aria-label="Sample plan draft"><h3>Sample plan · Draft</h3>{afternoon ? <ul><li>3:00–4:30 PM: Presentation outline</li><li>After 4:30 PM: Call the dentist and review project notes when available</li></ul> : <ul><li>8:30–10:00 AM: Presentation outline</li><li>Before 11:00 AM: Call the dentist</li><li>11:00 AM: Meeting</li><li>After the meeting: Review project notes when available</li></ul>}<p>No calendar changes have been made.</p></div>}
    <p role="status">{status}</p>
  </div></section>;
}
