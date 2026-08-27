process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/render/project/.playwright";

import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());
app.use(express.json());

// ===============================
// 🔥 BROWSER GLOBAL (REUTILIZABLE)
// ===============================
let browser;
let page;

// Inicia UNA sola vez
async function iniciarBrowserGlobal() {
    if (browser && browser.isConnected()) return;

    browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox"
        ]
    });

    page = await browser.newPage();
    console.log("🟢 Browser inicializado");
}

// ===============================
// 🔥 FUNCIÓN PRINCIPAL CON REINTENTO
// ===============================
async function consultarCedula(cedula, intentos = 2) {

    for (let i = 0; i < intentos; i++) {

        try {
            console.log(`🔎 Intento ${i + 1} para:`, cedula);

            await page.goto("https://profesiones.sep.gob.mx/", {
                waitUntil: "domcontentloaded",
                timeout: 60000
            });

            const page1Promise = page.waitForEvent("popup");

            await page.getByRole("link", {
                name: "Consulta Pública Información"
            }).click();

            const page1 = await page1Promise;

            await page1.waitForLoadState("domcontentloaded");
            await page1.waitForTimeout(2000);

            // cerrar modal si existe
            const cerrar = page1.locator("button:has-text('×')");
            if (await cerrar.isVisible().catch(() => false)) {
                await cerrar.click();
            }

            // ir a tab correcto
            await page1.locator('a[href="#tab-01"]').click();

            await page1.waitForTimeout(2000);

            // esperar input real
            const input = page1.locator("#cedula");
            await input.waitFor({ state: "visible", timeout: 15000 });

            await input.fill(cedula);

            const btn = page1.locator("button:has-text('Buscar')");
            await btn.click({ force: true });

            await page1.waitForTimeout(4000);

            const filas = page1.locator("tbody tr");
            const total = await filas.count();

            if (total === 0) {
                return null;
            }

            const data = await filas.first().locator("td").allTextContents();

            return {
                success: true,
                valida: true,
                numeroCedula: data[0] || cedula,
                nombre: data[1] || "",
                apellidoPaterno: data[2] || "",
                apellidoMaterno: data[3] || "",
                genero: data[4] || "",
                institucion: data[5] || "",
                profesion: data[6] || "",
                entidad: data[7] || "",
                anioRegistro: data[8] || "",
                fechaConsulta: new Date().toISOString(),
                fuente: "SEP"
            };

        } catch (err) {
            console.log("⚠️ Error intento:", i + 1);

            if (i === intentos - 1) throw err;
        }
    }
}

// ===============================
// 🔥 API ENDPOINT
// ===============================
app.post("/validar-cedula", async (req, res) => {

    const { cedula } = req.body;

    if (!cedula) {
        return res.status(400).json({
            success: false,
            message: "Falta cédula"
        });
    }

    try {

        await iniciarBrowserGlobal();

        const result = await consultarCedula(cedula);

        if (!result) {
            return res.json({
                success: false,
                valida: false,
                message: "No encontrada"
            });
        }

        return res.json(result);

    } catch (error) {

        console.error("💥 ERROR FINAL:", error);

        // reinicia browser si se rompe
        if (browser) {
            await browser.close();
            browser = null;
            page = null;
        }

        return res.status(500).json({
            success: false,
            message: "Error SEP",
            error: error.message
        });
    }
});

// ===============================
// 🔥 START SERVER
// ===============================
app.listen(3001, async () => {
    console.log("🚀 Scraper SEP estable corriendo en puerto 3001");

    await iniciarBrowserGlobal();
});