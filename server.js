import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

let browser = null;

async function iniciarBrowser() {
    if (browser && browser.isConnected()) {
        return browser;
    }

    console.log("🚀 Iniciando Chromium...");

    browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-zygote"
        ]
    });

    console.log("🟢 Chromium iniciado correctamente");

    return browser;
}

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        service: "SEP Scraper Service",
        message: "Servidor funcionando"
    });
});

app.get("/diagnostico", async (req, res) => {
    const resultado = {
        servidor: true,
        chromium: false,
        profesiones: false,
        cedula: false
    };

    try {
        const browser = await iniciarBrowser();
        resultado.chromium = browser.isConnected();
    } catch (error) {
        resultado.chromium = false;
        resultado.chromiumError = error.message;
    }

    try {
        const response = await fetch(
            "https://profesiones.sep.gob.mx/",
            {
                method: "GET",
                redirect: "follow",
                signal: AbortSignal.timeout(15000)
            }
        );

        resultado.profesiones = response.ok;
        resultado.profesionesStatus = response.status;
    } catch (error) {
        resultado.profesionesError = error.message;
    }

    try {
        const response = await fetch(
            "https://cedulaprofesional.sep.gob.mx/",
            {
                method: "GET",
                redirect: "follow",
                signal: AbortSignal.timeout(15000)
            }
        );

        resultado.cedula = response.ok;
        resultado.cedulaStatus = response.status;
    } catch (error) {
        resultado.cedulaError = error.message;
    }

    res.json(resultado);
});

app.post("/validar-cedula", async (req, res) => {
    const { cedula } = req.body;

    if (!cedula) {
        return res.status(400).json({
            success: false,
            valida: false,
            message: "Falta cédula"
        });
    }

    try {
        const browser = await iniciarBrowser();

        const context = await browser.newContext({
            viewport: {
                width: 1366,
                height: 768
            },
            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/131.0.0.0 Safari/537.36"
        });

        const page = await context.newPage();

        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(60000);

        console.log("======================================");
        console.log("🔎 CONSULTANDO CÉDULA:", cedula);
        console.log("======================================");

        console.log("🌐 Abriendo profesiones.sep.gob.mx...");

        try {
            await page.goto(
                "https://profesiones.sep.gob.mx/",
                {
                    waitUntil: "commit",
                    timeout: 30000
                }
            );

            console.log("🟢 Navegación iniciada");
            console.log("URL:", page.url());

            await page.waitForTimeout(5000);

            console.log(
                "TITLE:",
                await page.title().catch(() => "SIN TITULO")
            );

            console.log(
                "BODY:",
                (
                    await page.locator("body").innerText()
                        .catch(() => "")
                ).substring(0, 5000)
            );
        } catch (error) {
            console.log(
                "❌ Error navegando SEP:",
                error.message
            );
        }

        await context.close();

        return res.json({
            success: false,
            valida: false,
            message: "Diagnóstico completado",
            cedula: String(cedula),
            url: page.url()
        });

    } catch (error) {
        console.error("💥 ERROR:", error);

        return res.status(500).json({
            success: false,
            valida: false,
            message: "Error interno",
            error: error.message
        });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("======================================");
    console.log("🚀 SERVIDOR SEP INICIADO");
    console.log("📡 Puerto:", PORT);
    console.log("======================================");
});