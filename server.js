import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const URL_SEP = "https://profesiones.sep.gob.mx/";
const URL_CEDULA = "https://cedulaprofesional.sep.gob.mx/";

async function probarURL(nombre, url) {
    console.log("\n======================================");
    console.log("🔎 PRUEBA:", nombre);
    console.log("🌐 URL:", url);
    console.log("======================================");

    const inicio = Date.now();

    try {
        const respuesta = await fetch(url, {
            method: "GET",
            redirect: "manual",
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language":
                    "es-MX,es;q=0.9,en;q=0.8"
            },
            signal: AbortSignal.timeout(30000)
        });

        const tiempo = Date.now() - inicio;

        const headers = {};

        respuesta.headers.forEach((valor, clave) => {
            headers[clave] = valor;
        });

        const texto = await respuesta.text();

        console.log("✅ RESPUESTA RECIBIDA");
        console.log("📊 Status:", respuesta.status);
        console.log("📊 StatusText:", respuesta.statusText);
        console.log("⏱️ Tiempo:", tiempo + " ms");
        console.log("➡️ Location:", respuesta.headers.get("location"));
        console.log("📦 Content-Type:", respuesta.headers.get("content-type"));
        console.log("📏 Tamaño:", texto.length);
        console.log("📋 Headers:", JSON.stringify(headers, null, 2));

        console.log("\n========== RESPUESTA ==========");
        console.log(texto.substring(0, 3000));
        console.log("================================");

        return {
            ok: true,
            status: respuesta.status,
            statusText: respuesta.statusText,
            tiempo,
            location: respuesta.headers.get("location"),
            contentType: respuesta.headers.get("content-type"),
            size: texto.length,
            preview: texto.substring(0, 3000)
        };
    } catch (error) {
        const tiempo = Date.now() - inicio;

        console.error("❌ ERROR:", error.message);
        console.error("⏱️ Tiempo:", tiempo + " ms");

        return {
            ok: false,
            error: error.message,
            tiempo
        };
    }
}

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        service: "SEP Diagnostic Service"
    });
});

app.get("/diagnostico", async (req, res) => {
    console.log("\n\n");
    console.log("######################################");
    console.log("# INICIANDO DIAGNÓSTICO SEP");
    console.log("######################################");

    const sep = await probarURL(
        "PORTAL PROFESIONES SEP",
        URL_SEP
    );

    const cedula = await probarURL(
        "CONSULTA CÉDULA",
        URL_CEDULA
    );

    console.log("\n######################################");
    console.log("# DIAGNÓSTICO TERMINADO");
    console.log("######################################");

    res.json({
        success: true,
        fecha: new Date().toISOString(),
        pruebas: {
            profesiones: sep,
            cedula
        }
    });
});

app.listen(PORT, () => {
    console.log("🚀 Servidor diagnóstico iniciado");
    console.log("📡 Puerto:", PORT);
    console.log("🌐 Endpoint: /diagnostico");
});