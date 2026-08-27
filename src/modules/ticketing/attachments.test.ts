import { describe, expect, it } from "vitest";
import {
  expectedStoragePath,
  isAttachmentMetadataComplete,
  validateAttachmentMetadata,
} from "./attachments";

describe("Attachments — validación", () => {
  it("rechaza original_name fuera de rango", () => {
    const r = validateAttachmentMetadata({
      tenantId: "t",
      ticketId: "ti",
      uploadedBy: "u",
      originalName: "",
      mimeType: "image/png",
      sizeBytes: 100,
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza size_bytes <= 0", () => {
    const r = validateAttachmentMetadata({
      tenantId: "t",
      ticketId: "ti",
      uploadedBy: "u",
      originalName: "foto.png",
      mimeType: "image/png",
      sizeBytes: 0,
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza size_bytes > 25 MB", () => {
    const r = validateAttachmentMetadata({
      tenantId: "t",
      ticketId: "ti",
      uploadedBy: "u",
      originalName: "foto.png",
      mimeType: "image/png",
      sizeBytes: 26_214_401,
    });
    expect(r.ok).toBe(false);
  });

  it("acepta metadata válida", () => {
    const r = validateAttachmentMetadata({
      tenantId: "t",
      ticketId: "ti",
      uploadedBy: "u",
      originalName: "foto.png",
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    expect(r.ok).toBe(true);
  });

  it("construye el path esperado en Storage", () => {
    expect(expectedStoragePath("t1", "t2", "foto.png")).toBe(
      "ticket-attachments/t1/t2/foto.png",
    );
    // caracteres no permitidos se sanean
    expect(expectedStoragePath("t1", "t2", "foto con espacios.png")).toBe(
      "ticket-attachments/t1/t2/foto_con_espacios.png",
    );
  });

  it("identifica metadata completa cuando storage_path y sha256 están presentes", () => {
    expect(
      isAttachmentMetadataComplete({ storagePath: "x", sha256: "y" }),
    ).toBe(true);
    expect(
      isAttachmentMetadataComplete({ storagePath: null, sha256: null }),
    ).toBe(false);
  });
});
