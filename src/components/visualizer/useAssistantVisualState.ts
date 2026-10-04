import { useCallback, useEffect, useReducer } from "react";
import {
  ACTION_VISUAL_DURATION_MS,
  assistantVisualReducer,
  createAssistantVisualModel,
  resolveActivity,
  type AssistantVisualInputs,
  type AssistantVisualState,
} from "./visual-state";

export function useAssistantVisualState(inputs: AssistantVisualInputs): {
  visualState: AssistantVisualState;
  requestAction: (status?: string) => void;
  clearAction: () => void;
} {
  const [model, dispatch] = useReducer(
    assistantVisualReducer,
    inputs,
    (initialInputs) =>
      createAssistantVisualModel(initialInputs, performance.now()),
  );

  // Reconcile the projection during render so consumers never see the prior
  // voice activity for an effect cycle. No microphone or playback flags live here.
  if (
    model.visualState.activity !== resolveActivity(inputs) ||
    model.error !== inputs.error.trim()
  ) {
    dispatch({ type: "source", inputs, now: performance.now() });
  }

  useEffect(() => {
    if (!model.action) return;
    const { token, startedAt } = model.action;
    const remaining = Math.max(
      0,
      ACTION_VISUAL_DURATION_MS - (performance.now() - startedAt),
    );
    const timer = setTimeout(() => {
      dispatch({ type: "expire-action", token, now: performance.now() });
    }, remaining);
    return () => clearTimeout(timer);
  }, [model.action]);

  const requestAction = useCallback((status?: string) => {
    dispatch({ type: "request-action", status, now: performance.now() });
  }, []);

  const clearAction = useCallback(() => {
    dispatch({ type: "clear-action", now: performance.now() });
  }, []);

  return { visualState: model.visualState, requestAction, clearAction };
}
