export async function compressData(data) {
  const encoder = new TextEncoder();
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(encoder.encode(data));
  writer.close();
  const compressed = await new Response(stream.readable).arrayBuffer();
  // Base64 encode Uint8Array
  let binary = '';
  const bytes = new Uint8Array(compressed);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decompressData(encodedData) {
  // Base64 decode
  const binary_string = atob(encodedData);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return await new Response(stream.readable).text();
}
