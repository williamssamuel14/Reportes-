// Guarda y entrega la lista de técnicos. Solo quien tenga el PIN (variable ADMIN_PIN) puede cambiarla.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("config");
  if (req.method === "GET") {
    const list = (await store.get("tecnicos", { type: "json" })) || [];
    return Response.json({ list }, { headers: { "cache-control": "no-store" } });
  }
  if (req.method === "POST") {
    const pin = process.env.ADMIN_PIN;
    if (!pin || req.headers.get("x-admin-pin") !== pin) {
      return Response.json({ error: "PIN incorrecto" }, { status: 401 });
    }
    let body = {};
    try { body = await req.json(); } catch (e) {}
    if (body.verificar) return Response.json({ ok: true });
    if (!Array.isArray(body.list)) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    const list = body.list
      .filter((n) => typeof n === "string")
      .map((n) => n.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 60);
    await store.setJSON("tecnicos", list);
    return Response.json({ ok: true, list });
  }
  return new Response("Método no permitido", { status: 405 });
};

export const config = { path: "/api/tecnicos" };
