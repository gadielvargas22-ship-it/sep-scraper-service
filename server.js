process.env.PLAYWRIGHT_BROWSERS_PATH =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    "/opt/render/project/.playwright";

import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

let browser = null;
let context = null;

// ======================================================
// INICIAR BROWSER
// ======================================================

async function iniciarBrowser() {

    if (browser && browser.isConnected()) {
        return;
    }

    console.log("🚀 Iniciando Chromium...");

    browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-zygote",
            "--single-process"
        ]
    });

    context = await browser.newContext({
        viewport: {
            width: 1366,
            height: 768
        },
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    });

    console.log("🟢 Browser inicializado");
}


// ======================================================
// CERRAR BROWSER
// ======================================================

async function reiniciarBrowser() {

    try {

        if (context) {
            await context.close();
        }

    } catch (e) {
        console.log("⚠️ Error cerrando contexto");
    }

    try {

        if (browser) {
            await browser.close();
        }

    } catch (e) {
        console.log("⚠️ Error cerrando browser");
    }

    browser = null;
    context = null;

    console.log("🔄 Browser reiniciado");
}


// ======================================================
// CERRAR MODALES
// ======================================================

async function cerrarModales(page) {

    try {

        const posiblesCierres = [

            "button:has-text('×')",
            "button:has-text('Cerrar')",
            "button:has-text('ACEPTAR')",
            "button:has-text('Aceptar')",
            ".btn-close",
            ".close",
            "[aria-label='Close']",
            "[aria-label='Cerrar']"

        ];

        for (const selector of posiblesCierres) {

            const elementos = page.locator(selector);

            const cantidad = await elementos.count();

            if (cantidad > 0) {

                for (let i = 0; i < cantidad; i++) {

                    const elemento = elementos.nth(i);

                    if (await elemento.isVisible().catch(() => false)) {

                        console.log(
                            "🔒 Cerrando posible modal:",
                            selector
                        );

                        await elemento
                            .click({ force: true })
                            .catch(() => {});

                        await page.waitForTimeout(500);
                    }
                }
            }
        }

    } catch (error) {

        console.log(
            "⚠️ No se pudieron cerrar todos los modales:",
            error.message
        );
    }
}


// ======================================================
// ESPERAR PAGINA SEP
// ======================================================

async function prepararPaginaSEP(page) {

    console.log("🌐 Abriendo SEP...");

    await page.goto(
        "https://profesiones.sep.gob.mx/",
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    console.log("✅ SEP cargada");

    await page.waitForTimeout(3000);

    await cerrarModales(page);
}


// ======================================================
// ABRIR CONSULTA PÚBLICA
// ======================================================

async function abrirConsultaPublica(page) {

    console.log("🔎 Buscando Consulta Pública...");

    const enlace = page.getByRole("link", {
        name: /Consulta Pública Información/i
    });

    await enlace.waitFor({
        state: "visible",
        timeout: 30000
    });

    console.log("✅ Enlace encontrado");

    // Escuchamos popup ANTES del click
    const popupPromise = page.waitForEvent("popup", {
        timeout: 10000
    }).catch(() => null);

    await enlace.click({
        force: true
    });

    const popup = await popupPromise;

    // ==================================================
    // CASO 1: LA SEP ABRIÓ OTRA VENTANA
    // ==================================================

    if (popup) {

        console.log("🟢 Consulta Pública abrió nueva ventana");

        await popup.waitForLoadState(
            "domcontentloaded",
            { timeout: 30000 }
        ).catch(() => {});

        await popup.waitForTimeout(3000);

        return popup;
    }

    // ==================================================
    // CASO 2: LA SEP CAMBIÓ LA MISMA PÁGINA
    // ==================================================

    console.log(
        "ℹ️ No hubo popup; verificando página actual..."
    );

    await page.waitForTimeout(3000);

    return page;
}


// ======================================================
// ACTIVAR PESTAÑA DE CÉDULA
// ======================================================

async function seleccionarCedula(page) {

    console.log("🔎 Buscando opción Número de cédula...");

    // Primero intentamos el href que ya sabemos que funciona
    const tabCedula = page.locator(
        'a[href="#tab-01"]'
    );

    if (await tabCedula.count() > 0) {

        console.log("✅ Encontrada pestaña #tab-01");

        await tabCedula.first().scrollIntoViewIfNeeded();

        await tabCedula.first().click({
            force: true
        }).catch(async () => {

            await tabCedula.first().evaluate(
                element => element.click()
            );
        });

    } else {

        console.log(
            "⚠️ No apareció a[href='#tab-01']"
        );

        // Intentar mediante texto
        const textos = [
            /Número de cédula/i,
            /Numero de cedula/i,
            /Cédula/i,
            /Cedula/i
        ];

        let encontrado = false;

        for (const texto of textos) {

            const elemento = page.getByText(texto, {
                exact: false
            }).first();

            if (
                await elemento.count() > 0 &&
                await elemento.isVisible().catch(() => false)
            ) {

                console.log(
                    "✅ Encontrada opción por texto:",
                    texto
                );

                await elemento.scrollIntoViewIfNeeded();

                await elemento.click({
                    force: true
                }).catch(() => {});

                encontrado = true;

                break;
            }
        }

        if (!encontrado) {

            throw new Error(
                "No se encontró la pestaña de Número de cédula"
            );
        }
    }

    await page.waitForTimeout(2500);

    await cerrarModales(page);

    console.log("✅ Opción cédula seleccionada");
}


// ======================================================
// BUSCAR INPUT DE CÉDULA
// ======================================================

async function encontrarInputCedula(page) {

    console.log("🔎 Buscando campo de cédula...");

    const selectores = [

        "#cedula",

        "input[id='cedula']",

        "input[placeholder='Cédula']",

        "input[placeholder*='Cédula' i]",

        "input[name='cedula']",

        "input[name*='cedula' i]",

        "input[formcontrolname='cedula']",

        "input[id*='cedula' i]",

        "input[placeholder*='cedula' i]"

    ];

    // ==================================================
    // PRIMER INTENTO
    // ==================================================

    for (const selector of selectores) {

        const input = page.locator(selector).first();

        if (await input.count() === 0) {
            continue;
        }

        if (
            await input.isVisible().catch(() => false)
        ) {

            console.log(
                "✅ Input encontrado:",
                selector
            );

            return input;
        }
    }

    // ==================================================
    // SEGUNDO INTENTO: ESPERAR
    // ==================================================

    console.log(
        "⏳ Esperando que aparezca el input..."
    );

    for (const selector of selectores) {

        const input = page.locator(selector).first();

        if (await input.count() === 0) {
            continue;
        }

        try {

            await input.waitFor({
                state: "visible",
                timeout: 5000
            });

            console.log(
                "✅ Input apareció:",
                selector
            );

            return input;

        } catch {
            // continuar
        }
    }

    // ==================================================
    // TERCER INTENTO: INSPECCIONAR INPUTS
    // ==================================================

    console.log(
        "⚠️ No encontramos #cedula."
    );

    const inputs = page.locator("input");

    const total = await inputs.count();

    console.log(
        "📋 Inputs encontrados:",
        total
    );

    for (let i = 0; i < total; i++) {

        const input = inputs.nth(i);

        console.log(
            `INPUT ${i}`,
            {
                id: await input.getAttribute("id"),
                name: await input.getAttribute("name"),
                placeholder:
                    await input.getAttribute("placeholder"),
                type:
                    await input.getAttribute("type"),
                formControl:
                    await input.getAttribute("formcontrolname"),
                visible:
                    await input.isVisible().catch(() => false)
            }
        );
    }

    throw new Error(
        "No se encontró el campo de cédula"
    );
}


// ======================================================
// BUSCAR BOTÓN
// ======================================================

async function encontrarBotonBuscar(page) {

    console.log("🔎 Buscando botón Buscar...");

    const selectores = [

        "button:has-text('Buscar')",

        "button",

        "input[type='submit']",

        "input[type='button']"

    ];

    for (const selector of selectores) {

        const elementos = page.locator(selector);

        const cantidad = await elementos.count();

        for (let i = 0; i < cantidad; i++) {

            const elemento = elementos.nth(i);

            if (
                await elemento.isVisible().catch(() => false)
            ) {

                const texto =
                    await elemento
                        .innerText()
                        .catch(() => "");

                const valor =
                    await elemento
                        .getAttribute("value")
                        .catch(() => "");

                if (
                    /buscar/i.test(texto) ||
                    /buscar/i.test(valor || "")
                ) {

                    console.log(
                        "✅ Botón Buscar encontrado"
                    );

                    return elemento;
                }
            }
        }
    }

    throw new Error(
        "No se encontró el botón Buscar"
    );
}


// ======================================================
// ESPERAR RESULTADOS
// ======================================================

async function obtenerResultados(page) {

    console.log(
        "⏳ Esperando resultados de SEP..."
    );

    // Esperamos hasta 15 segundos,
    // comprobando varias veces.

    for (let i = 0; i < 15; i++) {

        const filas = page.locator(
            "tbody tr"
        );

        const total = await filas.count();

        if (total > 0) {

            console.log(
                "🟢 Filas encontradas:",
                total
            );

            return filas;
        }

        await page.waitForTimeout(1000);
    }

    console.log(
        "⚠️ No se encontraron filas."
    );

    return null;
}


// ======================================================
// EXTRAER DATOS
// ======================================================

async function extraerDatos(filas, cedula) {

    const celdas =
        await filas
            .first()
            .locator("td")
            .allTextContents();

    const data =
        celdas.map(texto =>
            texto
                .replace(/\s+/g, " ")
                .trim()
        );

    console.log(
        "📦 Datos obtenidos:",
        data
    );

    return {

        success: true,

        valida: true,

        numeroCedula:
            data[0] || cedula,

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
}


// ======================================================
// CONSULTAR CÉDULA
// ======================================================

async function consultarCedula(cedula) {

    await iniciarBrowser();

    const page =
        await context.newPage();

    try {

        console.log(
            "===================================="
        );

        console.log(
            "🔎 CONSULTANDO CÉDULA:",
            cedula
        );

        console.log(
            "===================================="
        );

        // ----------------------------------------------
        // 1. SEP
        // ----------------------------------------------

        await prepararPaginaSEP(page);

        // ----------------------------------------------
        // 2. CONSULTA PÚBLICA
        // ----------------------------------------------

        const paginaConsulta =
            await abrirConsultaPublica(page);

        // ----------------------------------------------
        // 3. PREPARAR CONSULTA
        // ----------------------------------------------

        await paginaConsulta.waitForLoadState(
            "domcontentloaded",
            { timeout: 30000 }
        ).catch(() => {});

        await paginaConsulta.waitForTimeout(3000);

        await cerrarModales(
            paginaConsulta
        );

        // ----------------------------------------------
        // 4. SELECCIONAR CÉDULA
        // ----------------------------------------------

        await seleccionarCedula(
            paginaConsulta
        );

        // ----------------------------------------------
        // 5. INPUT
        // ----------------------------------------------

        const input =
            await encontrarInputCedula(
                paginaConsulta
            );

        await input.fill("");

        await input.fill(
            String(cedula).trim()
        );

        console.log(
            "✍️ Cédula escrita:",
            cedula
        );

        // ----------------------------------------------
        // 6. BOTÓN
        // ----------------------------------------------

        const boton =
            await encontrarBotonBuscar(
                paginaConsulta
            );

        await boton.scrollIntoViewIfNeeded();

        // force=true porque la SEP puede dejar
        // elementos transparentes encima del botón.

        await boton.click({
            force: true
        });

        console.log(
            "🔍 Buscando..."
        );

        // ----------------------------------------------
        // 7. RESULTADOS
        // ----------------------------------------------

        const filas =
            await obtenerResultados(
                paginaConsulta
            );

        if (!filas) {

            console.log(
                "❌ Cédula no encontrada"
            );

            return {

                success: false,

                valida: false,

                message:
                    "No encontrada"
            };
        }

        // ----------------------------------------------
        // 8. DATOS
        // ----------------------------------------------

        return await extraerDatos(
            filas,
            cedula
        );

    } finally {

        await page.close().catch(() => {});

    }
}


// ======================================================
// ENDPOINT PRINCIPAL
// ======================================================

app.post(
    "/validar-cedula",
    async (req, res) => {

        const cedula =
            req.body?.cedula;

        console.log(
            "📥 Petición recibida:",
            cedula
        );

        // ----------------------------------------------
        // VALIDAR CÉDULA
        // ----------------------------------------------

        if (!cedula) {

            return res.status(400).json({

                success: false,

                valida: false,

                message:
                    "Falta cédula"
            });
        }

        const cedulaLimpia =
            String(cedula)
                .trim()
                .replace(/\D/g, "");

        if (!cedulaLimpia) {

            return res.status(400).json({

                success: false,

                valida: false,

                message:
                    "Cédula inválida"
            });
        }

        try {

            const resultado =
                await consultarCedula(
                    cedulaLimpia
                );

            return res.json(
                resultado
            );

        } catch (error) {

            console.error(
                "💥 ERROR SEP:",
                error
            );

            // Si el navegador se rompe,
            // lo reiniciamos para la siguiente petición.

            await reiniciarBrowser();

            return res.status(500).json({

                success: false,

                valida: false,

                message:
                    "Error SEP",

                error:
                    error.message
            });
        }
    }
);


// ======================================================
// HEALTH CHECK
// ======================================================

app.get(
    "/",
    (req, res) => {

        res.json({

            success: true,

            service:
                "SEP Scraper API",

            status:
                "online",

            endpoint:
                "POST /validar-cedula"

        });
    }
);


// ======================================================
// START SERVER
// ======================================================

app.listen(
    PORT,
    async () => {

        console.log(
            `🚀 Scraper SEP corriendo en puerto ${PORT}`
        );

        try {

            await iniciarBrowser();

            console.log(
                "🟢 Servicio listo"
            );

        } catch (error) {

            console.error(
                "❌ No se pudo iniciar Chromium:",
                error.message
            );
        }
    }
);