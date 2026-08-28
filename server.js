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
        service: "SEP Scraper Service"
    });
});

app.post("/validar-cedula", async (req, res) => {
    const { cedula } = req.body;

    console.log("======================================");
    console.log("📥 SOLICITUD:", cedula);
    console.log("======================================");

    if (!cedula) {
        return res.status(400).json({
            success: false,
            valida: false,
            message: "Falta cédula"
        });
    }

    let context = null;

    try {
        const browser = await iniciarBrowser();

        context = await browser.newContext({
            viewport: {
                width: 1366,
                height: 768
            },
            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/131.0.0.0 Safari/537.36",
            locale: "es-MX"
        });

        const page = await context.newPage();

        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(90000);

        page.on("request", request => {
            const url = request.url();

            if (
                url.includes("sep.gob.mx") ||
                url.includes("cedulaprofesional")
            ) {
                console.log(
                    "➡️ REQUEST:",
                    request.method(),
                    url
                );
            }
        });

        page.on("response", response => {
            const url = response.url();

            if (
                url.includes("sep.gob.mx") ||
                url.includes("cedulaprofesional")
            ) {
                console.log(
                    "⬅️ RESPONSE:",
                    response.status(),
                    response.request().method(),
                    url
                );
            }
        });

        page.on("requestfailed", request => {
            const url = request.url();

            if (
                url.includes("sep.gob.mx") ||
                url.includes("cedulaprofesional")
            ) {
                console.log(
                    "💥 REQUEST FAILED:",
                    url
                );

                console.log(
                    "   ERROR:",
                    request.failure()?.errorText
                );
            }
        });

        page.on("console", message => {
            console.log(
                "🌐 BROWSER CONSOLE:",
                message.type(),
                message.text()
            );
        });

        page.on("pageerror", error => {
            console.log(
                "💥 PAGE ERROR:",
                error.message
            );
        });

        console.log("======================================");
        console.log("🌐 PASO 1: PORTAL PRINCIPAL");
        console.log("======================================");

        const respuestaPrincipal = await page.goto(
            "https://profesiones.sep.gob.mx/",
            {
                waitUntil: "domcontentloaded",
                timeout: 90000
            }
        );

        console.log(
            "📡 STATUS PRINCIPAL:",
            respuestaPrincipal?.status()
        );

        console.log(
            "🌐 URL:",
            page.url()
        );

        console.log(
            "📄 TITLE:",
            await page.title().catch(() => "SIN TITULO")
        );

        await page.waitForTimeout(3000);

        const enlaces = await page.locator("a").evaluateAll(
            elements =>
                elements.map((a, index) => ({
                    index,
                    texto: a.innerText?.trim(),
                    href: a.href,
                    target: a.target
                }))
        );

        console.log("======================================");
        console.log("🔗 ENLACES SEP");
        console.log("======================================");

        for (const enlace of enlaces) {
            if (
                enlace.texto?.toLowerCase().includes("consulta") ||
                enlace.href?.includes("cedulaprofesional")
            ) {
                console.log(enlace);
            }
        }

        const enlaceConsulta = page.locator(
            'a[href="https://cedulaprofesional.sep.gob.mx/"]'
        ).first();

        const existe = await enlaceConsulta.count();

        console.log(
            "🔎 ENLACE CONSULTA EXISTE:",
            existe > 0
        );

        if (!existe) {
            throw new Error(
                "No se encontró el enlace Consulta Pública"
            );
        }

        const href = await enlaceConsulta.getAttribute("href");

        console.log(
            "🎯 DESTINO:",
            href
        );

        console.log("======================================");
        console.log("🌐 PASO 2: CONSULTA PÚBLICA");
        console.log("======================================");

        console.log(
            "🚀 Intentando navegación directa..."
        );

        try {
            const respuestaConsulta = await page.goto(
                href,
                {
                    waitUntil: "domcontentloaded",
                    timeout: 90000
                }
            );

            console.log(
                "📡 STATUS CONSULTA:",
                respuestaConsulta?.status()
            );

            console.log(
                "📡 STATUS TEXT:",
                respuestaConsulta?.statusText()
            );

            console.log(
                "📡 RESPONSE URL:",
                respuestaConsulta?.url()
            );

        } catch (error) {
            console.log(
                "❌ GOTO CONSULTA ERROR:",
                error.message
            );
        }

        await page.waitForTimeout(5000);

        console.log("======================================");
        console.log("📊 ESTADO FINAL");
        console.log("======================================");

        console.log(
            "🌐 URL FINAL:",
            page.url()
        );

        console.log(
            "📄 TITLE FINAL:",
            await page.title().catch(() => "SIN TITULO")
        );

        const body = await page.locator("body")
            .innerText()
            .catch(() => "");

        console.log("======================================");
        console.log("📄 BODY FINAL");
        console.log("======================================");

        console.log(
            body.substring(0, 15000)
        );

        console.log("======================================");
        console.log("🧾 HTML FINAL");
        console.log("======================================");

        const html = await page.content()
            .catch(() => "");

        console.log(
            html.substring(0, 10000)
        );

        console.log("======================================");
        console.log("🏁 DIAGNÓSTICO TERMINADO");
        console.log("======================================");

        await context.close();

        return res.json({
            success: true,
            valida: false,
            message: "Diagnóstico terminado",
            cedula: String(cedula),
            urlFinal: page.url()
        });

    } catch (error) {
        console.error("💥 ERROR GENERAL:", error);

        if (context) {
            await context.close().catch(() => {});
        }

        return res.status(500).json({
            success: false,
            valida: false,
            message: "Error diagnóstico",
            error: error.message
        });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("======================================");
    console.log("🚀 SERVIDOR SEP INICIADO");
    console.log("📡 PUERTO:", PORT);
    console.log("======================================");
});