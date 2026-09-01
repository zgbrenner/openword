// Origin Private File System operations, written against the structural
// shape of FileSystemDirectoryHandle/FileSystemFileHandle so they can be
// exercised in tests with in-memory fakes. OPFS `createWritable` stages
// bytes in a swap file and only replaces the visible file when the stream
// closes, which gives web saves the same never-a-torn-file guarantee as the
// desktop staged-write sequence.

async function resolveDirectory(root, segments, create) {
  let directory = root;
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }
  return directory;
}

export async function readOpfsFile(root, segments) {
  const directory = await resolveDirectory(root, segments.slice(0, -1), false);
  const handle = await directory.getFileHandle(segments[segments.length - 1]);
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function writeOpfsFileAtomic(root, segments, bytes) {
  const directory = await resolveDirectory(root, segments.slice(0, -1), true);
  const handle = await directory.getFileHandle(segments[segments.length - 1], { create: true });
  const writable = await handle.createWritable({ keepExistingData: false });
  try {
    await writable.write(bytes);
  } catch (error) {
    await writable.abort?.().catch(() => {});
    throw error;
  }
  await writable.close();
}

export async function opfsFileExists(root, segments) {
  try {
    const directory = await resolveDirectory(root, segments.slice(0, -1), false);
    await directory.getFileHandle(segments[segments.length - 1]);
    return true;
  } catch {
    return false;
  }
}

export async function removeOpfsFile(root, segments) {
  try {
    const directory = await resolveDirectory(root, segments.slice(0, -1), false);
    await directory.removeEntry(segments[segments.length - 1]);
  } catch {
    // Removal is best-effort cleanup; missing files are already gone.
  }
}
