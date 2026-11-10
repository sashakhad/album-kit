export function isListenerVisitorId(visitorId: string): boolean {
  return visitorId.startsWith('listener:') && visitorId.length > 'listener:'.length;
}
