/** Local command: replay the saved greeting without involving the model. */
export function isGreetingRequest(text: string): boolean {
  return /^(?:hey\s+)?(?:jarvis[\s,:-]+)?repeat\s+(?:(?:the|your)\s+)?greeting[.!?]*$/i.test(
    text.trim(),
  );
}
