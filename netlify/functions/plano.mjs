// Plano de cada nodo: ver/descargar, subir (si no existe) y, solo con PIN, reemplazar o eliminar.
// Acepta archivos de AutoCAD (.dwg, .dxf), PDF e imágenes.
import { getStore } from "@netlify/blobs";

const NODO = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
const TIPOS_OK = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const CAD = ["dwg", "dxf"];
const MAX = 5500000;
const esAdmin = (req) => {
  const p = process.env.ADMIN_PIN;
  return !!p && req.headers.get("x-admin-pin") === p;
};
const err = (m, s) => Response.json({ error: m }, { status: s });

export default async (req) => {
  const planos = getStore("planos");
  const nodos = getStore("nodos");
  const n = (new URL(req.url).searchParams.get("nodo") || "").toUpperCase().trim();
  if (!NODO.test(n)) return err("Nodo inválido", 400);

  if (req.method === "GET") {
    const r = await planos.getWithMetadata(n, { type: "arrayBuffer" });
    if (!r) return new Response("No hay plano", { status: 404 });
    const tipo = (r.metadata && r.metadata.tipo) || "application/octet-stream";
    const nombre = (r.metadata && r.metadata.nombre) || "plano";
    const verEnPantalla = tipo.startsWith("image/") || tipo === "application/pdf";
    return new Response(r.data, {
      headers: {
        "content-type": verEnPantalla ? tipo : "application/octet-stream",
        "content-disposition": verEnPantalla ? "inline" : "attachment; filename*=UTF-8''" + encodeURIComponent(nombre),
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=0, must-revalidate",
      },
    });
  }

  if (req.method === "POST") {
    const existe = await planos.getMetadata(n);
    if (existe && !esAdmin(req)) return err("Este nodo ya tiene plano. Solo el administrador puede reemplazarlo.", 403);

    let nombre = "plano";
    try { nombre = decodeURIComponent(req.headers.get("x-nombre") || "plano").slice(0, 100); } catch (e) {}
    const ext = (nombre.split(".").pop() || "").toLowerCase();

    const data = await req.arrayBuffer();
    if (!data.byteLength || data.byteLength > MAX) return err("El archivo es muy pesado (máximo 5 MB).", 413);

    let tipo = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (tipo === "application/octet-stream") {
      if (!CAD.includes(ext)) return err("Solo se permiten archivos DWG, DXF, PDF o imágenes.", 400);
      if (ext === "dwg") {
        const cab = new TextDecoder().decode(new Uint8Array(data.slice(0, 6)));
        if (!cab.startsWith("AC1")) return err("El archivo no parece un DWG válido.", 400);
      }
      tipo = ext === "dwg" ? "application/acad" : "application/dxf";
    } else if (!TIPOS_OK.includes(tipo)) {
      return err("Solo se permiten archivos DWG, DXF, PDF o imágenes.", 400);
    }

    await planos.set(n, data, { metadata: { tipo, nombre, fecha: new Date().toISOString() } });
    await nodos.set(n, "1");
    return Response.json({ ok: true });
  }

  if (req.method === "DELETE") {
    if (!esAdmin(req)) return err("PIN incorrecto", 401);
    await planos.delete(n);
    return Response.json({ ok: true });
  }
  return new Response("Método no permitido", { status: 405 });
};

export const config = { path: "/api/plano" };
