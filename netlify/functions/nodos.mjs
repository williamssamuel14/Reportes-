// Nodos: lista de nodos, reportes por nodo (guardar, listar, borrar).
import { getStore } from "@netlify/blobs";

const NODO = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
const TIPOS = ["resumen", "falla", "calle", "edificio"];
const json = (d, s = 200) => Response.json(d, { status: s, headers: { "cache-control": "no-store" } });
const esAdmin = (req) => {
  const p = process.env.ADMIN_PIN;
  return !!p && req.headers.get("x-admin-pin") === p;
};

export default async (req) => {
  const reportes = getStore("reportes");
  const nodos = getStore("nodos");
  const planos = getStore("planos");
  const url = new URL(req.url);

  if (req.method === "GET") {
    const n = (url.searchParams.get("nodo") || "").toUpperCase().trim();
    if (!n) {
      const [a, b, c] = await Promise.all([nodos.list(), reportes.list(), planos.list()]);
      const mapa = {};
      const sumar = (k) => {
        if (!NODO.test(k)) return null;
        mapa[k] = mapa[k] || { nodo: k, reportes: 0, plano: false };
        return mapa[k];
      };
      a.blobs.forEach((x) => sumar(x.key));
      b.blobs.forEach((x) => { const o = sumar(x.key.split("/")[0]); if (o) o.reportes++; });
      c.blobs.forEach((x) => { const o = sumar(x.key); if (o) o.plano = true; });
      return json({ nodos: Object.values(mapa).sort((x, y) => x.nodo.localeCompare(y.nodo)) });
    }
    if (!NODO.test(n)) return json({ error: "Nodo inválido" }, 400);
    const lista = await reportes.list({ prefix: n + "/" });
    const reps = (
      await Promise.all(lista.blobs.slice(-300).map((b) => reportes.get(b.key, { type: "json" }).catch(() => null)))
    ).filter(Boolean);
    const pl = await planos.getMetadata(n);
    return json({ reportes: reps, plano: pl ? pl.metadata : null });
  }

  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const n = String(b.nodo || "").toUpperCase().trim();
    if (!NODO.test(n)) return json({ error: "Nodo inválido" }, 400);

    if (b.accion === "nodo") {
      await nodos.set(n, "1");
      return json({ ok: true });
    }
    if (b.accion === "reporte") {
      const r = b.reporte || {};
      if (
        !/^[a-z0-9]{6,20}$/.test(r.id || "") ||
        !TIPOS.includes(r.tipo) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha || "") ||
        typeof r.texto !== "string" || !r.texto.trim() || r.texto.length > 8000
      ) return json({ error: "Reporte inválido" }, 400);
      const limpio = {
        id: r.id, tipo: r.tipo, fecha: r.fecha, nodo: n, texto: r.texto,
        tecnicos: String(r.tecnicos || "").slice(0, 200),
        num: String(r.num || "").slice(0, 60),
        creado: new Date().toISOString(),
      };
      await reportes.setJSON(n + "/" + r.id, limpio);
      await nodos.set(n, "1");
      const ant = String(b.anterior || "").toUpperCase().trim();
      if (ant && ant !== n && NODO.test(ant)) await reportes.delete(ant + "/" + r.id);
      return json({ ok: true });
    }
    if (b.accion === "borrar_reporte") {
      if (!esAdmin(req)) return json({ error: "PIN incorrecto" }, 401);
      if (!/^[a-z0-9]{6,20}$/.test(b.id || "")) return json({ error: "Id inválido" }, 400);
      await reportes.delete(n + "/" + b.id);
      return json({ ok: true });
    }
    return json({ error: "Acción inválida" }, 400);
  }
  return new Response("Método no permitido", { status: 405 });
};

export const config = { path: "/api/nodos" };
