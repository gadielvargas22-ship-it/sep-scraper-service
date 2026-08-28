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
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "es-MX,es;q=0.9,en;q=0.8"
            },
            signal: AbortSignal.timeout(30000)
        });

        const tiempo = Date.now() - inicio;
        const texto = await respuesta.text();

        console.log("✅ RESPUESTA RECIBIDA");
        console.log("📊 Status:", respuesta.status);
        console.log("📊 StatusText:", respuesta.statusText);
        console.log("⏱️ Tiempo:", tiempo + " ms");
        console.log("➡️ Location:", respuesta.headers.get("location"));
        console.log("📦 Content-Type:", respuesta.headers.get("content-type"));
        console.log("📏 Tamaño:", texto.length);

        console.log("\n========== RESPUESTA ==========");
        console.log(texto.substring(0, 1000));
        console.log("================================");

        return {
            ok: true,
            status: respuesta.status,
            statusText: respuesta.statusText,
            tiempo,
            location: respuesta.headers.get("location"),
            contentType: respuesta.headers.get("content-type"),
            size: texto.length,
            preview: texto.substring(0, 1000)
        };

    } catch (error) {
        const tiempo = Date.now() - inicio;

        console.error("\n❌ ERROR COMPLETO");
        console.error("name:", error?.name);
        console.error("message:", error?.message);
        console.error("code:", error?.code);
        console.error("errno:", error?.errno);
        console.error("syscall:", error?.syscall);
        console.error("hostname:", error?.hostname);

        if (error?.cause) {
            console.error("\n========== CAUSA ==========");
            console.error("cause.name:", error.cause?.name);
            console.error("cause.message:", error.cause?.message);
            console.error("cause.code:", error.cause?.code);
            console.error("cause.errno:", error.cause?.errno);
            console.error("cause.syscall:", error.cause?.syscall);
            console.error("cause.hostname:", error.cause?.hostname);
            console.error("===========================");
        }

        console.error("\nSTACK:");
        console.error(error?.stack);

        console.error("\n⏱️ Tiempo:", tiempo + " ms");

        return {
            ok: false,
            tiempo,
            error: {
                name: error?.name,
                message: error?.message,
                code: error?.code,
                errno: error?.errno,
                syscall: error?.syscall,
                hostname: error?.hostname,
                cause: error?.cause ? {
                    name: error.cause?.name,
                    message: error.cause?.message,
                    code: error.cause?.code,
                    errno: error.cause?.errno,
                    syscall: error.cause?.syscall,
                    hostname: error.cause?.hostname
                } : null
            }
        };
    }
}