import { corsHeaders } from "../_shared/cors.ts";

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({
    service: "games-mne",
    status: "ok",
    note: "Health check only. Game operations are not implemented in this starter."
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
