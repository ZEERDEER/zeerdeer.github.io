export default {
    async fetch(request, env, ctx) {
        // CORS Headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
        };

        // Handle OPTIONS
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 200, headers: corsHeaders });
        }

        const url = new URL(request.url);

        // --- Auth Route (Login) ---
        if (url.pathname === "/auth" && request.method === "POST") {
            try {
                const { username, password } = await request.json();
                // Username check (optional, defaults to true if env var not set)
                const validUser = env.ADMIN_USERNAME ? username === env.ADMIN_USERNAME : true;
                // Password check (must match API_SECRET)
                const validPass = password === (env.API_SECRET || env.ADMIN_PASSWORD);

                if (validUser && validPass) {
                    const timestamp = Date.now().toString();
                    const secret = env.API_SECRET || env.ADMIN_PASSWORD;
                    const encoder = new TextEncoder();
                    const key = await crypto.subtle.importKey(
                        "raw",
                        encoder.encode(secret),
                        { name: "HMAC", hash: "SHA-256" },
                        false,
                        ["sign"]
                    );
                    const signatureBuffer = await crypto.subtle.sign(
                        "HMAC",
                        key,
                        encoder.encode(timestamp)
                    );
                    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
                    const token = `${timestamp}.${signature}`;

                    return new Response(JSON.stringify({ success: true, token }), {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } else {
                    return new Response(JSON.stringify({ success: false, message: "Invalid credentials" }), {
                        status: 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
            }
        }

        // --- 1. GET Request ---
        if (request.method === "GET") {
            let games = [];
            let storeStatus = "Initializing";

            try {
                // Read from KV
                const kvGames = await env.GAMES_KV.get('games_data', { type: 'json' });
                if (kvGames) {
                    games = kvGames;
                    storeStatus = `Connected (${games.length} items)`;
                } else {
                    storeStatus = "Connected (Empty)";
                }
            } catch (error) {
                storeStatus = `Error: ${error.message}`;
            }

            return new Response(JSON.stringify({
                games,
                serverTime: new Date().toISOString(),
                storeStatus,
                provider: "Cloudflare Workers"
            }), {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                }
            });
        }

        // --- Auth Validation ---
        const authHeader = request.headers.get("Authorization");
        if (!await isValidToken(authHeader, env)) {
            return new Response(JSON.stringify({ message: "无效的身份令牌" }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // --- 2. POST Request ---
        if (request.method === "POST") {
            try {
                const body = await request.json();
                let { name, icon, steamId, id } = body;

                if (steamId && (!name || !icon)) {
                    try {
                        const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}`);
                        const steamJson = await steamRes.json();
                        if (steamJson?.[steamId]?.success) {
                            const data = steamJson[steamId].data;
                            name = name || data.name;
                            icon = icon || data.header_image;
                        }
                    } catch (e) {
                        console.error('Steam API Error:', e);
                    }
                }

                if (!name || !icon) {
                    return new Response(JSON.stringify({ message: "缺少必要数据" }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const cleanName = name.replace(/<[^>]*>?/gm, '');
                const cleanIcon = icon.replace(/<[^>]*>?/gm, '');

                // Get current data
                let games = (await env.GAMES_KV.get('games_data', { type: 'json' })) || [];

                if (id) {
                    const index = games.findIndex(g => g.id === parseInt(id));
                    if (index !== -1) {
                        games[index] = { ...games[index], name: cleanName, icon: cleanIcon, steamId: steamId || null };
                    } else {
                        games.push({ id: Date.now(), name: cleanName, icon: cleanIcon, steamId: steamId || null });
                    }
                } else {
                    games.push({ id: Date.now(), name: cleanName, icon: cleanIcon, steamId: steamId || null });
                }

                // Save to KV
                await env.GAMES_KV.put('games_data', JSON.stringify(games));

                return new Response(JSON.stringify({ success: true, games }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            } catch (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        // --- 3. DELETE Request ---
        if (request.method === "DELETE") {
            try {
                const { id } = await request.json();
                let games = (await env.GAMES_KV.get('games_data', { type: 'json' })) || [];

                games = games.filter(g => g.id !== parseInt(id));

                await env.GAMES_KV.put('games_data', JSON.stringify(games));

                return new Response(JSON.stringify({ success: true, games }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            } catch (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }
};

async function isValidToken(token, env) {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [timestamp, signature] = parts;
    const secret = env.API_SECRET || env.ADMIN_PASSWORD; // Defined in Wrangler secrets

    if (!secret) return false;

    // Time validation (24h)
    if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
    );

    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));

    return await crypto.subtle.verify(
        "HMAC",
        key,
        signatureBytes,
        encoder.encode(timestamp)
    );
}
