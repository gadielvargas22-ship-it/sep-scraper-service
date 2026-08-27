process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/render/project/.playwright";

import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

let browser = null;
let context = null;

// =====================================================
// INICIAR BROWSER
// =====================================================

async function iniciarBrowser() {
    if (browser && browser.isConnected()) {
        return;
    }

    console.log("🌐 Iniciando Chromium...");

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

    context = await browser.newContext({
        viewport: {
            width: 1366,
            height: 768
        },
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
    });

    console.log("🟢 Browser inicializado");
}

// =====================================================
// CREAR PAGINA NUEVA
// =====================================================

async function nuevaPagina() {

    await iniciarBrowser();

    const page = await context.newPage();

    page.setDefaultTimeout(30000);

    return page;
}

// =====================================================
// CERRAR MODALES
// =====================================================

async function cerrarModales(page) {

    try {

        const posiblesBotones = [
            "button:has-text('×')",
            "button:has-text('Cerrar')",
            "button:has-text('ACEPTAR')",
            "button:has-text('Aceptar')",
            ".close"
        ];

        for (const selector of posiblesBotones) {

            const boton = page.locator(selector).first();

            if (await boton.isVisible().catch(() => false)) {

                console.log("🔸 Cerrando modal...");

                await boton.click({
                    force: true
                }).catch(() => {});

                await page.waitForTimeout(500);
            }
        }

    } catch {
        // Si no existe modal, continuamos
    }
}

// =====================================================
// ABRIR CONSULTA PÚBLICA
// =====================================================

async function abrirConsultaPublica(page) {

    console.log("🔎 Buscando Consulta Pública...");

    const enlace = page.getByRole("link", {
        name: /Consulta Pública Información/i
    }).first();

    await enlace.waitFor({
        state: "visible",
        timeout: 30000
    });

    /*
     * La SEP puede abrir la consulta:
     *
     * 1. En popup
     * 2. En nueva pestaña
     * 3. En la misma página
     *
     * Por eso NO usamos únicamente waitForEvent("popup").
     */

    const paginasAntes = context.pages();

    await enlace.click({
        force: true
    });

    await page.waitForTimeout(3000);

    const paginasDespues = context.pages();

    // Si apareció una nueva página
    if (paginasDespues.length > paginasAntes.length) {

        const nueva = paginasDespues.find(
            p => !paginasAntes.includes(p)
        );

        if (nueva) {

            console.log("🟢 Consulta Pública abrió nueva pestaña");

            await nueva.waitForLoadState("domcontentloaded", {
                timeout: 30000
            }).catch(() => {});

            return nueva;
        }
    }

    // Si fue la misma página
    console.log("🟢 Consulta Pública abrió en la misma página");

    await page.waitForLoadState("domcontentloaded", {
        timeout: 30000
    }).catch(() => {});

    return page;
}

// =====================================================
// SELECCIONAR CONSULTA POR CÉDULA
// =====================================================

async function seleccionarCedula(page) {

    console.log("🔎 Buscando opción de cédula...");

    const tab = page.locator('a[href="#tab-01"]').first();

    if (await tab.count() > 0) {

        await tab.waitFor({
            state: "visible",
            timeout: 30000
        }).catch(() => {});

        await tab.click({
            force: true
        }).catch(() => {});

        console.log("🟢 Opción cédula seleccionada");

        await page.waitForTimeout(1500);

        return;
    }

    /*
     * Respaldo por texto
     */

    const textos = [
        "Número de cédula",
        "Numero de cedula",
        "Cédula",
        "Cedula"
    ];

    for (const texto of textos) {

        const elemento = page.getByText(texto, {
            exact: false
        }).first();

        if (await elemento.count() > 0) {

            await elemento.click({
                force: true
            }).catch(() => {});

            console.log("🟢 Opción cédula seleccionada por texto");

            await page.waitForTimeout(1500);

            return;
        }
    }

    throw new Error("No se encontró la opción de consulta por cédula");
}

// =====================================================
// ESPERAR INPUT DE CÉDULA
// =====================================================

async function obtenerInputCedula(page) {

    const input = page.locator("#cedula").first();

    await input.waitFor({
        state: "visible",
        timeout: 30000
    });

    return input;
}

// =====================================================
// HACER CONSULTA
// =====================================================

async function consultarCedula(cedula) {

    const page = await nuevaPagina();

    try {

        console.log("=================================");
        console.log("🔎 CONSULTANDO CÉDULA:", cedula);
        console.log("=================================");

        // -------------------------------------------------
        // 1. Entrar al portal SEP
        // -------------------------------------------------

        await page.goto(
            "https://profesiones.sep.gob.mx/",
            {
                waitUntil: "domcontentloaded",
                timeout: 60000
            }
        );

        console.log("🟢 Portal SEP cargado");

        await page.waitForTimeout(2000);

        // -------------------------------------------------
        // 2. Cerrar cualquier modal
        // -------------------------------------------------

        await cerrarModales(page);

        // -------------------------------------------------
        // 3. Abrir consulta pública
        // -------------------------------------------------

        const consultaPage = await abrirConsultaPublica(page);

        await consultaPage.waitForTimeout(2000);

        // -------------------------------------------------
        // 4. Cerrar modal de consulta
        // -------------------------------------------------

        await cerrarModales(consultaPage);

        // -------------------------------------------------
        // 5. Seleccionar búsqueda por cédula
        // -------------------------------------------------

        await seleccionarCedula(consultaPage);

        // -------------------------------------------------
        // 6. Obtener input
        // -------------------------------------------------

        const input = await obtenerInputCedula(consultaPage);

        console.log("🟢 Campo cédula encontrado");

        // -------------------------------------------------
        // 7. Escribir cédula
        // -------------------------------------------------

        await input.fill("");

        await input.fill(String(cedula));

        console.log("✏️ Cédula escrita:", cedula);

        // -------------------------------------------------
        // 8. Buscar botón
        // -------------------------------------------------

        const botonBuscar = consultaPage
            .locator("button")
            .filter({
                hasText: /Buscar/i
            })
            .first();

        await botonBuscar.waitFor({
            state: "visible",
            timeout: 30000
        });

        console.log("🟢 Botón Buscar encontrado");

        // -------------------------------------------------
        // 9. Click
        // -------------------------------------------------

        await botonBuscar.click({
            force: true
        });

        console.log("🔎 Buscando en SEP...");

        // -------------------------------------------------
        // 10. Esperar resultados
        // -------------------------------------------------

        await consultaPage.waitForTimeout(5000);

        // -------------------------------------------------
        // 11. Buscar tabla
        // -------------------------------------------------

        const filas = consultaPage.locator("tbody tr");

        let total = await filas.count();

        console.log("📊 Filas encontradas:", total);

        // -------------------------------------------------
        // 12. Segundo intento de lectura
        // -------------------------------------------------

        if (total === 0) {

            await consultaPage.waitForTimeout(4000);

            total = await filas.count();

            console.log(
                "📊 Filas después de esperar:",
                total
            );
        }

        // -------------------------------------------------
        // 13. No encontrada
        // -------------------------------------------------

        if (total === 0) {

            console.log("❌ Cédula no encontrada");

            return {
                success: false,
                valida: false,
                message: "No encontrada"
            };
        }

        // -------------------------------------------------
        // 14. Obtener datos
        // -------------------------------------------------

        const celdas = await filas
            .first()
            .locator("td")
            .allTextContents();

        const data = celdas.map(
            texto => texto.trim()
        );

        console.log("📋 Datos obtenidos:", data);

        // -------------------------------------------------
        // 15. Validar que realmente haya información
        // -------------------------------------------------

        if (
            data.length === 0 ||
            data.every(valor => valor === "")
        ) {

            return {
                success: false,
                valida: false,
                message: "No encontrada"
            };
        }

        // -------------------------------------------------
        // 16. RESPUESTA FINAL
        // -------------------------------------------------

        return {
            success: true,
            valida: true,

            numeroCedula:
                data[0] || String(cedula),

            nombre:
                data[1] || "",

            apellidoPaterno:
                data[2] || "",

            apellidoMaterno:
                data[3] || "",

            genero:
                data[4] || "",

            institucion:
                data[5] || "",

            profesion:
                data[6] || "",

            entidad:
                data[7] || "",

            anioRegistro:
                data[8] || "",

            fechaConsulta:
                new Date().toISOString(),

            fuente:
                "SEP"
        };

    } finally {

        /*
         * Cerramos solamente la pestaña.
         *
         * NO cerramos Chromium completo.
         * Así Render puede reutilizar el navegador
         * en próximas consultas.
         */

        await page.close().catch(() => {});

    }
}

// =====================================================
// ENDPOINT
// =====================================================

app.post("/validar-cedula", async (req, res) => {

    const { cedula } = req.body;

    // -------------------------------------------------
    // Validación
    // -------------------------------------------------

    if (
        cedula === undefined ||
        cedula === null ||
        String(cedula).trim() === ""
    ) {

        return res.status(400).json({
            success: false,
            valida: false,
            message: "Falta cédula"
        });
    }

    const cedulaLimpia =
        String(cedula).trim();

    // -------------------------------------------------
    // Validar formato básico
    // -------------------------------------------------

    if (!/^\d+$/.test(cedulaLimpia)) {

        return res.status(400).json({
            success: false,
            valida: false,
            message: "La cédula debe contener solamente números"
        });
    }

    try {

        const resultado =
            await consultarCedula(cedulaLimpia);

        return res.json(resultado);

    } catch (error) {

        console.error(
            "💥 ERROR SEP:",
            error
        );

        /*
         * Si Chromium se rompió,
         * lo reiniciamos para la siguiente petición.
         */

        if (browser) {

            await browser
                .close()
                .catch(() => {});
        }

        browser = null;
        context = null;

        return res.status(500).json({

            success: false,

            valida: false,

            message: "Error SEP",

            error: error.message
        });
    }
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/", (req, res) => {

    res.json({
        success: true,
        service: "SEP Scraper API",
        status: "online"
    });
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, async () => {

    console.log(
        `🚀 Scraper SEP corriendo en puerto ${PORT}`
    );

    try {

        await iniciarBrowser();

        console.log(
            "🟢 Servicio listo para recibir consultas"
        );

    } catch (error) {

        console.error(
            "💥 No se pudo iniciar Chromium:",
            error.message
        );
    }
});