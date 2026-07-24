// @ts-nocheck — ops script; run via Bun, not part of the app tsconfig.
/**
 * Host-OS desktop release: signed Tauri build → Supabase Storage → release_artifact upsert.
 *
 * Usage: bun run release [--skip-build] [--notes "..."]
 *
 * Requires at repo root:
 *   - TAURI_SIGNING_PRIVATE_KEY.pem
 *   - .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - optional SUPABASE_RELEASES_BUCKET (default: desktop-releases)
 *
 * Bucket must already exist and be public. Apple notarization is out of scope.
 */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const KEY_PATH = path.join(ROOT, "TAURI_SIGNING_PRIVATE_KEY.pem");
const DEFAULT_BUCKET = "desktop-releases";

type HostPlatform = {
  target: "darwin" | "windows";
  arch: "aarch64" | "x86_64";
};

type CliArgs = {
  skipBuild: boolean;
  notes: string | undefined;
};

type ArtifactPair = {
  packagePath: string;
  signaturePath: string;
  fileName: string;
};

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));
  const host = detectHostPlatform();
  const version = await readSyncedVersion();
  const { url: supabaseUrl, serviceRoleKey, bucket } = readSupabaseEnv();

  console.log(`release ${version} → ${host.target}-${host.arch}`);

  const privateKey = await readFile(KEY_PATH, "utf8");
  if (privateKey.trim().length === 0) {
    throw new Error(`Signing key is empty: ${KEY_PATH}`);
  }

  if (!args.skipBuild) {
    console.log("building (tauri build)…");
    await runTauriBuild(privateKey);
  } else {
    console.log("skipping build (--skip-build)");
  }

  const artifact = await findUpdaterArtifact(host);
  console.log(`artifact: ${artifact.packagePath}`);

  const signature = (await readFile(artifact.signaturePath, "utf8")).trim();
  if (signature.length === 0) {
    throw new Error(`Signature file is empty: ${artifact.signaturePath}`);
  }

  const objectPath = `${host.target}-${host.arch}/${version}/${artifact.fileName}`;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`uploading → ${bucket}/${objectPath}`);
  const packageBytes = await readFile(artifact.packagePath);
  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, packageBytes, {
    contentType: contentTypeFor(artifact.fileName),
    upsert: true,
  });
  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  const publicUrl = publicUrlData.publicUrl;
  if (!publicUrl) {
    throw new Error("getPublicUrl returned an empty URL");
  }

  const id = `${host.target}-${host.arch}`;
  const notes = await resolveNotes(supabase, id, args.notes);
  const pubDate = new Date().toISOString();

  console.log(`upserting release_artifact ${id}`);
  const { error: upsertError } = await supabase.from("release_artifact").upsert(
    {
      id,
      target: host.target,
      arch: host.arch,
      version,
      url: publicUrl,
      signature,
      notes,
      pub_date: pubDate,
      updated_at: pubDate,
    },
    { onConflict: "target,arch" },
  );
  if (upsertError) {
    throw new Error(`release_artifact upsert failed: ${upsertError.message}`);
  }

  await warnIfPlatformsLag(supabase, version);
  console.log(`done: ${version} ${id}`);
  console.log(`url: ${publicUrl}`);
}

function parseArgs(argv: string[]): CliArgs {
  let skipBuild = false;
  let notes: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--skip-build") {
      skipBuild = true;
      continue;
    }
    if (arg === "--notes") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error('--notes requires a value, e.g. --notes "bug fixes"');
      }
      notes = value;
      i++;
      continue;
    }
    if (arg.startsWith("--notes=")) {
      notes = arg.slice("--notes=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { skipBuild, notes };
}

function detectHostPlatform(): HostPlatform {
  const platform = process.platform;
  const arch = process.arch;

  let target: HostPlatform["target"];
  if (platform === "darwin") {
    target = "darwin";
  } else if (platform === "win32") {
    target = "windows";
  } else {
    throw new Error(`Unsupported host OS: ${platform} (need darwin or win32)`);
  }

  let mappedArch: HostPlatform["arch"];
  if (arch === "arm64") {
    mappedArch = "aarch64";
  } else if (arch === "x64") {
    mappedArch = "x86_64";
  } else {
    throw new Error(`Unsupported host arch: ${arch} (need arm64 or x64)`);
  }

  return { target, arch: mappedArch };
}

async function readSyncedVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as {
    version?: unknown;
  };
  const tauriConf = JSON.parse(
    await readFile(path.join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"),
  ) as { version?: unknown };
  const cargoToml = await readFile(path.join(ROOT, "src-tauri", "Cargo.toml"), "utf8");
  const cargoMatch = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(cargoToml);

  const packageVersion = typeof packageJson.version === "string" ? packageJson.version : null;
  const tauriVersion = typeof tauriConf.version === "string" ? tauriConf.version : null;
  const cargoVersion = cargoMatch?.[1] ?? null;

  if (!packageVersion || !tauriVersion || !cargoVersion) {
    throw new Error(
      `Missing version field(s): package.json=${packageVersion}, tauri.conf.json=${tauriVersion}, Cargo.toml=${cargoVersion}`,
    );
  }

  if (packageVersion !== tauriVersion || packageVersion !== cargoVersion) {
    throw new Error(
      [
        "Version mismatch — sync these before releasing:",
        `  package.json:        ${packageVersion}`,
        `  tauri.conf.json:     ${tauriVersion}`,
        `  src-tauri/Cargo.toml: ${cargoVersion}`,
      ].join("\n"),
    );
  }

  return packageVersion;
}

function readSupabaseEnv(): {
  url: string;
  serviceRoleKey: string;
  bucket: string;
} {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_RELEASES_BUCKET?.trim() || DEFAULT_BUCKET;

  if (!url) {
    throw new Error("SUPABASE_URL is required in root .env");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required in root .env");
  }

  return { url, serviceRoleKey, bucket };
}

function runTauriBuild(privateKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", "tauri", "build"], {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        TAURI_SIGNING_PRIVATE_KEY: privateKey,
      },
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tauri build exited with code ${code ?? "unknown"}`));
    });
  });
}

async function findUpdaterArtifact(host: HostPlatform): Promise<ArtifactPair> {
  const bundleRoot = path.join(ROOT, "src-tauri", "target", "release", "bundle");

  if (host.target === "darwin") {
    return pickSignedPackage(path.join(bundleRoot, "macos"), (name) => name.endsWith(".app.tar.gz"));
  }

  return pickSignedPackage(path.join(bundleRoot, "nsis"), (name) => name.endsWith(".exe"));
}

async function pickSignedPackage(
  directory: string,
  isPackage: (fileName: string) => boolean,
): Promise<ArtifactPair> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    throw new Error(`Bundle directory missing: ${directory} (build first, or drop --skip-build)`);
  }

  const packages = entries.filter((name) => isPackage(name) && !name.endsWith(".sig"));
  const withSig = packages.filter((name) => entries.includes(`${name}.sig`));

  if (withSig.length === 0) {
    throw new Error(
      `No signed updater artifact in ${directory}. Expected a package with a sibling .sig file.`,
    );
  }
  if (withSig.length > 1) {
    throw new Error(
      `Multiple signed updater artifacts in ${directory}: ${withSig.join(", ")}. Keep one.`,
    );
  }

  const fileName = withSig[0]!;
  return {
    packagePath: path.join(directory, fileName),
    signaturePath: path.join(directory, `${fileName}.sig`),
    fileName,
  };
}

function contentTypeFor(fileName: string): string {
  if (fileName.endsWith(".tar.gz")) {
    return "application/gzip";
  }
  if (fileName.endsWith(".exe")) {
    return "application/vnd.microsoft.portable-executable";
  }
  return "application/octet-stream";
}

async function resolveNotes(
  supabase: ReturnType<typeof createClient>,
  id: string,
  notesFlag: string | undefined,
): Promise<string | null> {
  if (notesFlag !== undefined) {
    return notesFlag;
  }

  const { data, error } = await supabase
    .from("release_artifact")
    .select("notes")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read existing notes: ${error.message}`);
  }

  const existing = data?.notes;
  return typeof existing === "string" ? existing : null;
}

async function warnIfPlatformsLag(
  supabase: ReturnType<typeof createClient>,
  version: string,
): Promise<void> {
  const { data, error } = await supabase.from("release_artifact").select("id, version");
  if (error) {
    console.warn(`could not check sibling platforms: ${error.message}`);
    return;
  }

  const lagging = (data ?? []).filter((row) => row.version !== version);
  if (lagging.length === 0) {
    return;
  }

  console.warn("warning: other platforms are not on this version (latest.json will omit them):");
  for (const row of lagging) {
    console.warn(`  ${row.id}: ${row.version}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`release failed: ${message}`);
  process.exit(1);
});
