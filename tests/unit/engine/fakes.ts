// Fake network for engine tests: no test ever touches the real internet.

export { fakeNet, type FakeNet, type FakeRoute } from '../../../fixtures/site.ts';

/** A body that never ends: proves we stop reading at the byte cap. */
export function endlessStream(chunk = 'x'.repeat(64 * 1024)): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(chunk);
  return new ReadableStream({
    pull(controller) {
      controller.enqueue(bytes);
    },
  });
}
