import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { JarvisOrb } from "../components/JarvisOrb";
import { seo } from "../seo";
export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="landing">
        <header>
          <strong>
            JARVIS
            <span className="logo-dot" />
          </strong>
          <span>PERSONAL AI ASSISTANT</span>
        </header>
        <main>
          <p className="eyebrow">A LITTLE MORE POSSIBLE</p>
          <h1>
            Your thoughts.
            <br />A capable companion.
          </h1>
          <p className="landing-description">
            An intelligent space to talk, think, plan, and remember. Your
            personal assistant, wherever the day takes you.
          </p>
          <Link to="/home" className="launch-link">
            Open JARVIS <span>↗</span>
          </Link>
          <p className="landing-note">
            Voice & text · Private conversations · Thoughtful memory
          </p>
        </main>
        <div className="landing-orb">
          <JarvisOrb />
          <span>READY WHEN YOU ARE</span>
        </div>
        <footer>
          JARVIS / PERSONAL INTELLIGENCE<span>Made for your everyday.</span>
        </footer>
      </div>
    </>
  );
}
