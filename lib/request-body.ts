export async function readTextBody(request: Request, limit: number): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return result + decoder.decode();
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      return null;
    }
    result += decoder.decode(value, { stream: true });
  }
}
