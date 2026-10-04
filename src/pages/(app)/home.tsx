import { useAuthProfileReady } from "deepspace";
import { JarvisChat } from "../../components/JarvisChat";
import { JarvisOrb } from "../../components/JarvisOrb";
export default function HomePage() {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true });
  return isSignedIn && user ? (
    <JarvisChat key={user.id} userId={user.id} />
  ) : (
    <div className="signed-out">
      <JarvisOrb />
      <h1>Your personal intelligence.</h1>
      <p>
        Sign in above to talk with JARVIS and keep your conversations private.
      </p>
    </div>
  );
}
