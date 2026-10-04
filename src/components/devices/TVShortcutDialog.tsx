import { Button, Modal } from "../ui";
import type { TVShortcutController } from "./useTVShortcuts";

export function TVShortcutDialog({
  controls,
  onDispatched,
}: {
  controls: TVShortcutController;
  onDispatched: () => void;
}) {
  const action = controls.pendingAction;
  const shortcut = action === "off" ? "Tv Off" : "Tv On";
  return (
    <Modal open={action !== null} onClose={controls.cancel} size="sm">
      <Modal.Header>
        <Modal.Title>Turn {action ?? "off"} KY TV now?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>Your iPhone will open the {shortcut} Siri Shortcut.</p>
        <p className="muted text-sm">
          Create a Shortcut with this exact name in Apple Shortcuts first.
          JARVIS cannot verify completion or the TV state from Safari. After
          checking the TV, you can confirm its state in the dashboard.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" data-greeting-skip onClick={controls.cancel}>
          Cancel
        </Button>
        <Button
          data-greeting-skip
          onClick={() => {
            if (controls.launch()) onDispatched();
          }}
        >
          Run {shortcut}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
