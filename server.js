process.env.PLAYWRIGHT_BROWSERS_PATH =
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
let page = null;

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
            "--no-zygote"
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

    page = await context.newPage();

    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);

    console.log("🟢 Browser inicializado");
}

// ======================================================
// CERRAR BROWSER
// ======================================================

async function cerrarBrowser() {

    try {

        if (context) {
            await context.close();
        }

    } catch (e) {
        console.log("⚠️ Error cerrando context");
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
    page = null;
}

// ======================================================
// CERRAR MODALES
// ======================================================

async function cerrarModales(pagina) {

    console.log("🔍 Revisando modales...");

    // Intentar botones de cerrar
    const botonesCerrar = [
        "button:has-text('×')",
        "button:has-text('Cerrar')",
        "button:has-text('CERRAR')",
        "[aria-label='Close']",
        "[aria-label='Cerrar']"
    ];

    for (const selector of botonesCerrar) {

        try {

            const botones = pagina.locator(selector);
            const cantidad = await botones.count();

            for (let i = 0; i < cantidad; i++) {

                const boton = botones.nth(i);

                if (await boton.isVisible().catch(() => false)) {

                    console.log("🧹 Cerrando modal...");

                    await boton.click({
                        force: true
                    }).catch(() => {});

                    await pagina.waitForTimeout(500);
                }
            }

        } catch (e) {}
    }

    // Si queda algún backdrop, intentar ocultarlo
    try {

        await pagina.evaluate(() => {

            const elementos = document.querySelectorAll(
                ".custom-modal-backdrop, .modal-backdrop"
            );

            elementos.forEach(el => {

                const style =
                    window.getComputedStyle(el);

                if (
                    style.display !== "none" &&
                    style.visibility !== "hidden"
                ) {

                    el.style.display = "none";
                    el.style.pointerEvents = "none";
                }

            });

        });

    } catch (e) {}

    await pagina.waitForTimeout(500);
}

// ======================================================
// ENCONTRAR PÁGINA DE CONSULTA
// ======================================================

async function abrirConsultaPublica() {

    console.log("🌐 Entrando al portal SEP...");

    await page.goto(
        "https://profesiones.sep.gob.mx/",
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    await page.waitForTimeout(3000);

    console.log("📄 Portal SEP cargado");

    // --------------------------------------------------
    // Buscar enlace
    // --------------------------------------------------

    console.log("========== LINKS SEP ==========");

const links = await page.locator("a").evaluateAll((elements) =>
    elements.map((a) => ({
        texto: a.innerText?.trim(),
        href: a.href,
        target: a.target
    }))
);

console.log(JSON.stringify(links, null, 2));

console.log("================================");

    await enlace.waitFor({
        state: "visible",
        timeout: 30000
    });

    console.log("🔗 Enlace de consulta encontrado");

    // --------------------------------------------------
    // Detectar si abre popup
    // --------------------------------------------------

    const paginasAntes =
        context.pages();

    let paginaConsulta = null;

    const popupPromise =
        page.waitForEvent("popup", {
            timeout: 10000
        }).catch(() => null);

    await enlace.click({
        force: true
    });

    const popup =
        await popupPromise;

    if (popup) {

        console.log("🪟 Consulta abierta en popup");

        paginaConsulta = popup;

    } else {

        console.log("📑 No hubo popup, revisando navegación");

        await page.waitForTimeout(3000);

        const paginasDespues =
            context.pages();

        if (
            paginasDespues.length >
            paginasAntes.length
        ) {

            paginaConsulta =
                paginasDespues[paginasDespues.length - 1];

        } else {

            paginaConsulta = page;
        }
    }

    await paginaConsulta.waitForLoadState(
        "domcontentloaded",
        {
            timeout: 60000
        }
    ).catch(() => {});

    await paginaConsulta.waitForTimeout(4000);

    console.log(
        "🌐 URL consulta:",
        paginaConsulta.url()
    );

    return paginaConsulta;
}

// ======================================================
// SELECCIONAR CONSULTA POR CÉDULA
// ======================================================

async function seleccionarCedula(pagina) {

    console.log(
        "🔎 Buscando opción Número de cédula..."
    );

    // Primero intentar cerrar cualquier modal
    await cerrarModales(pagina);

    // --------------------------------------------------
    // Opción directa
    // --------------------------------------------------

    const selectoresTab = [
        'a[href="#tab-01"]',
        '[href="#tab-01"]',
        'a:has-text("Número de cédula")',
        'button:has-text("Número de cédula")',
        'text=Número de cédula'
    ];

    let seleccionado = false;

    for (const selector of selectoresTab) {

        try {

            const elemento =
                pagina.locator(selector).first();

            if (
                await elemento.isVisible()
                    .catch(() => false)
            ) {

                console.log(
                    "🟢 Opción encontrada:",
                    selector
                );

                await elemento.click({
                    force: true
                });

                seleccionado = true;

                break;
            }

        } catch (e) {}
    }

    // --------------------------------------------------
    // Si no encontró, usar JavaScript
    // --------------------------------------------------

    if (!seleccionado) {

        console.log(
            "⚠️ No se encontró por selector. Intentando JavaScript..."
        );

        seleccionado =
            await pagina.evaluate(() => {

                const enlaces =
                    Array.from(
                        document.querySelectorAll("a")
                    );

                const encontrado =
                    enlaces.find(a => {

                        const texto =
                            a.textContent
                                ?.trim()
                                .toLowerCase();

                        return (
                            texto?.includes(
                                "número de cédula"
                            ) ||
                            texto?.includes(
                                "numero de cedula"
                            )
                        );

                    });

                if (encontrado) {

                    encontrado.click();

                    return true;
                }

                const tab =
                    document.querySelector(
                        'a[href="#tab-01"]'
                    );

                if (tab) {

                    tab.click();

                    return true;
                }

                return false;

            });
    }

    if (!seleccionado) {

        throw new Error(
            "No se encontró la opción de consulta por cédula"
        );
    }

    console.log(
        "🟢 Opción cédula seleccionada"
    );

    await pagina.waitForTimeout(2000);

    await cerrarModales(pagina);
}

// ======================================================
// ENCONTRAR CAMPO CÉDULA
// ======================================================

async function encontrarCampoCedula(pagina) {

    console.log(
        "🔍 Buscando campo de cédula..."
    );

    // --------------------------------------------------
    // Selectores conocidos
    // --------------------------------------------------

    const selectores = [

        "#cedula",

        'input[id="cedula"]',

        'input[name="cedula"]',

        'input[placeholder="Cédula"]',

        'input[placeholder*="Cédula" i]',

        'input[placeholder*="cedula" i]',

        'input[aria-label*="Cédula" i]',

        'input[type="text"]'

    ];

    for (const selector of selectores) {

        try {

            const elementos =
                pagina.locator(selector);

            const cantidad =
                await elementos.count();

            console.log(
                `Selector ${selector}: ${cantidad}`
            );

            for (let i = 0; i < cantidad; i++) {

                const elemento =
                    elementos.nth(i);

                const visible =
                    await elemento.isVisible()
                        .catch(() => false);

                if (visible) {

                    console.log(
                        "🟢 Campo encontrado:",
                        selector
                    );

                    return elemento;
                }
            }

        } catch (e) {}
    }

    // --------------------------------------------------
    // Buscar por todos los inputs visibles
    // --------------------------------------------------

    console.log(
        "🔎 Analizando todos los inputs..."
    );

    const inputs =
        pagina.locator("input");

    const total =
        await inputs.count();

    console.log(
        "TOTAL INPUTS:",
        total
    );

    for (let i = 0; i < total; i++) {

        const input =
            inputs.nth(i);

        try {

            const visible =
                await input.isVisible();

            if (!visible) continue;

            const info = {

                id:
                    await input.getAttribute("id"),

                name:
                    await input.getAttribute("name"),

                placeholder:
                    await input.getAttribute(
                        "placeholder"
                    ),

                type:
                    await input.getAttribute("type"),

                aria:
                    await input.getAttribute(
                        "aria-label"
                    )

            };

            console.log(
                "INPUT",
                i,
                info
            );

            const texto =
                JSON.stringify(info)
                    .toLowerCase();

            if (
                texto.includes("cedula") ||
                texto.includes("cédula")
            ) {

                console.log(
                    "🟢 Campo identificado por atributos"
                );

                return input;
            }

        } catch (e) {}
    }

    return null;
}

// ======================================================
// ESPERAR FORMULARIO
// ======================================================

async function esperarFormularioCedula(pagina) {

    console.log(
        "⏳ Esperando formulario de cédula..."
    );

    // Hasta 45 segundos
    const limite =
        Date.now() + 45000;

    while (Date.now() < limite) {

        await cerrarModales(pagina);

        const campo =
            await encontrarCampoCedula(
                pagina
            );

        if (campo) {

            console.log(
                "🟢 Formulario de cédula listo"
            );

            return campo;
        }

        await pagina.waitForTimeout(1500);
    }

    // --------------------------------------------------
    // DEBUG FINAL
    // --------------------------------------------------

    console.log(
        "❌ No apareció el formulario"
    );

    console.log(
        "URL actual:",
        pagina.url()
    );

    try {

        console.log(
            "Título:",
            await pagina.title()
        );

    } catch (e) {}

    throw new Error(
        "No se encontró el campo de cédula"
    );
}

// ======================================================
// BUSCAR BOTÓN
// ======================================================

async function encontrarBotonBuscar(pagina) {

    const selectores = [

        "button:has-text('Buscar')",

        "button:has-text('BUSCAR')",

        'button[type="submit"]',

        'input[type="submit"]',

        '[type="button"]:has-text("Buscar")'

    ];

    for (const selector of selectores) {

        try {

            const botones =
                pagina.locator(selector);

            const cantidad =
                await botones.count();

            for (let i = 0; i < cantidad; i++) {

                const boton =
                    botones.nth(i);

                if (
                    await boton.isVisible()
                        .catch(() => false)
                ) {

                    console.log(
                        "🟢 Botón Buscar encontrado:",
                        selector
                    );

                    return boton;
                }
            }

        } catch (e) {}
    }

    // Buscar cualquier botón por texto
    const botones =
        pagina.locator("button");

    const total =
        await botones.count();

    for (let i = 0; i < total; i++) {

        const boton =
            botones.nth(i);

        try {

            if (
                !(await boton.isVisible())
            ) continue;

            const texto =
                (
                    await boton.innerText()
                )
                    .trim()
                    .toLowerCase();

            if (
                texto.includes("buscar")
            ) {

                return boton;
            }

        } catch (e) {}
    }

    return null;
}

// ======================================================
// EXTRAER RESULTADO
// ======================================================

async function extraerResultado(pagina) {

    console.log(
        "🔎 Buscando resultados..."
    );

    // Esperar un poco por Angular
    await pagina.waitForTimeout(3000);

    // --------------------------------------------------
    // Buscar filas
    // --------------------------------------------------

    const filas =
        pagina.locator("tbody tr");

    // Esperar máximo 30 segundos
    const limite =
        Date.now() + 30000;

    while (Date.now() < limite) {

        const total =
            await filas.count();

        console.log(
            "Filas encontradas:",
            total
        );

        if (total > 0) {

            const data =
                await filas
                    .first()
                    .locator("td")
                    .allTextContents();

            console.log(
                "📋 Datos obtenidos:",
                data
            );

            return {

                success: true,

                valida: true,

                numeroCedula:
                    data[0]?.trim() || "",

                nombre:
                    data[1]?.trim() || "",

                apellidoPaterno:
                    data[2]?.trim() || "",

                apellidoMaterno:
                    data[3]?.trim() || "",

                genero:
                    data[4]?.trim() || "",

                institucion:
                    data[5]?.trim() || "",

                profesion:
                    data[6]?.trim() || "",

                entidad:
                    data[7]?.trim() || "",

                anioRegistro:
                    data[8]?.trim() || "",

                fechaConsulta:
                    new Date().toISOString(),

                fuente: "SEP"

            };
        }

        // Buscar mensajes de no encontrado
        try {

            const body =
                (
                    await pagina
                        .locator("body")
                        .innerText()
                )
                    .toLowerCase();

            if (
                body.includes("no se encontraron") ||
                body.includes("no se encontró") ||
                body.includes("no encontrada") ||
                body.includes("sin resultados")
            ) {

                console.log(
                    "ℹ️ Cédula no encontrada"
                );

                return null;
            }

        } catch (e) {}

        await pagina.waitForTimeout(1500);
    }

    return null;
}

// ======================================================
// CONSULTAR CÉDULA
// ======================================================

async function consultarCedula(cedula) {

    console.log(
        "======================================"
    );

    console.log(
        "🔎 CONSULTANDO CÉDULA:",
        cedula
    );

    console.log(
        "======================================"
    );

    const pagina =
        await abrirConsultaPublica();

    await seleccionarCedula(
        pagina
    );

    const campo =
        await esperarFormularioCedula(
            pagina
        );

    await campo.fill(
        String(cedula)
    );

    console.log(
        "✍️ Cédula escrita:",
        cedula
    );

    await cerrarModales(
        pagina
    );

    const boton =
        await encontrarBotonBuscar(
            pagina
        );

    if (!boton) {

        throw new Error(
            "No se encontró el botón Buscar"
        );
    }

    console.log(
        "🔍 Ejecutando búsqueda..."
    );

    // Force para evitar overlays
    await boton.click({
        force: true
    });

    console.log(
        "⏳ Esperando resultados..."
    );

    const resultado =
        await extraerResultado(
            pagina
        );

    return resultado;
}

// ======================================================
// ENDPOINT PRINCIPAL
// ======================================================

app.post(
    "/validar-cedula",
    async (req, res) => {

        const { cedula } =
            req.body;

        console.log(
            "📥 Solicitud recibida:",
            cedula
        );

        if (!cedula) {

            return res.status(400).json({

                success: false,

                valida: false,

                message:
                    "Falta cédula"

            });
        }

        try {

            await iniciarBrowser();

            const resultado =
                await consultarCedula(
                    cedula
                );

            if (!resultado) {

                return res.json({

                    success: false,

                    valida: false,

                    message:
                        "No encontrada"

                });
            }

            return res.json(
                resultado
            );

        } catch (error) {

            console.error(
                "💥 ERROR SEP:",
                error
            );

            // Reiniciar browser para
            // la siguiente petición
            await cerrarBrowser();

            // Intentar recuperarlo
            try {

                await iniciarBrowser();

            } catch (e) {

                console.error(
                    "❌ No se pudo reiniciar Chromium"
                );
            }

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

            status: "ok",

            service:
                "SEP Scraper Service",

            message:
                "API funcionando correctamente"

        });
    }
);

// ======================================================
// INICIAR SERVIDOR
// ======================================================

app.listen(
    PORT,
    async () => {

        console.log(
            `🚀 Scraper SEP corriendo en puerto ${PORT}`
        );

        try {

            await iniciarBrowser();

        } catch (error) {

            console.error(
                "❌ Error iniciando Chromium:",
                error.message
            );
        }
    }
);