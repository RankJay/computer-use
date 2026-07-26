import type { ToolResultOutput } from "@ai-sdk/provider-utils";

import { isRecord } from "./is-record";

/** Tool outputs that carry a PNG (or other image) as base64 for vision models. */
export type ImageToolOutput = {
  mimeType?: string;
  base64?: string;
  empty?: boolean;
  width?: number;
  height?: number;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scaleX?: number;
  scaleY?: number;
};

function readFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readImageFields(output: unknown): ImageToolOutput | null {
  if (!isRecord(output)) {
    return null;
  }
  const mimeType = typeof output.mimeType === "string" ? output.mimeType : undefined;
  const base64 = typeof output.base64 === "string" ? output.base64 : undefined;
  const empty = typeof output.empty === "boolean" ? output.empty : undefined;
  const width = typeof output.width === "number" ? output.width : undefined;
  const height = typeof output.height === "number" ? output.height : undefined;
  const scaleX = readFiniteNumber(output, "scaleX");
  const scaleY = readFiniteNumber(output, "scaleY");

  let bounds: ImageToolOutput["bounds"];
  if (isRecord(output.bounds)) {
    const { x, y, width: bw, height: bh } = output.bounds;
    if (
      typeof x === "number" &&
      typeof y === "number" &&
      typeof bw === "number" &&
      typeof bh === "number"
    ) {
      bounds = { x, y, width: bw, height: bh };
    }
  }

  return { mimeType, base64, empty, width, height, bounds, scaleX, scaleY };
}

/**
 * Map screenshot / clipboard-image tool JSON into multimodal model content.
 * Keeps geometry metadata as text when present; skips empty clipboard images.
 */
export function imageToolToModelOutput(options: {
  toolCallId: string;
  input: unknown;
  output: unknown;
}): ToolResultOutput {
  void options.toolCallId;
  void options.input;

  const image = readImageFields(options.output);
  if (!image || image.empty || !image.base64 || image.base64.length === 0) {
    return {
      type: "text",
      value: JSON.stringify(options.output ?? null),
    };
  }

  const mimeType =
    image.mimeType && image.mimeType.startsWith("image/") ? image.mimeType : "image/png";

  const metaParts: string[] = [];
  if (typeof image.width === "number" && typeof image.height === "number") {
    metaParts.push(`imageSize=${image.width}x${image.height}`);
  }
  if (image.bounds) {
    metaParts.push(
      `bounds={x:${image.bounds.x},y:${image.bounds.y},width:${image.bounds.width},height:${image.bounds.height}}`,
    );
  }
  if (typeof image.scaleX === "number" && typeof image.scaleY === "number") {
    metaParts.push(`scaleX=${image.scaleX}`);
    metaParts.push(`scaleY=${image.scaleY}`);
    metaParts.push(
      "To click a point in this image use mouse_click_image with imageX/imageY (host remaps). Do not compute screen coords yourself.",
    );
  }

  const value: Extract<ToolResultOutput, { type: "content" }>["value"] = [];

  if (metaParts.length > 0) {
    value.push({ type: "text", text: metaParts.join("\n") });
  }

  value.push({
    type: "file",
    mediaType: mimeType,
    data: { type: "data", data: image.base64 },
  });

  return { type: "content", value };
}
