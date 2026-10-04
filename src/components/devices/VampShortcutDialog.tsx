import { Button, Modal } from "../ui";
import type { VampShortcutController } from "./useVampShortcut";

export function VampShortcutDialog({
  controls,
  onDispatched,
}: {
  controls: VampShortcutController;
  onDispatched: () => void;
}) {
  return (
    <Modal open={controls.pending} onClose={controls.cancel} size="sm">
      <Modal.Header>
        <Modal.Title>Play Vamp</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>This will ask your iPhone to start Vamp in Apple Music.</p>
        <p className="muted text-sm">
          Create a Shortcut named Play Vamp in Apple Shortcuts first. Safari
          cannot verify native playback from the Shortcut handoff. Report the
          result when you return; MusicKit playback status is shown separately.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button data-greeting-skip variant="ghost" onClick={controls.cancel}>
          Cancel
        </Button>
        <Button
          data-greeting-skip
          onClick={() => {
            if (controls.launch()) onDispatched();
          }}
        >
          Send Play Request
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
