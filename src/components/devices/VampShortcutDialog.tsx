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
        <Modal.Title>Play Vamp on your iPhone?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>Your iPhone will open the Play Vamp Siri Shortcut.</p>
        <p className="muted text-sm">
          Create a Shortcut named Play Vamp in Apple Shortcuts first. Safari
          cannot verify device playback; dispatching will leave this request
          awaiting device confirmation.
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
          Run Play Vamp
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
