process.env.PLAYWRIGHT_BROWSERS_PATH =
    "/opt/render/project/.playwright";

import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/131.0.0.0 Safari/537.36"
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

        console.log(
            "⚠️ Error cerrando context:",
            e.message
        );

    }

    try {

        if (browser) {
            await browser.close();
        }

    } catch (e) {

        console.log(
            "⚠️ Error cerrando browser:",
            e.message
        );

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

    const botonesCerrar = [

        "button:has-text('×')",

        "button:has-text('Cerrar')",

        "button:has-text('CERRAR')",

        "[aria-label='Close']",

        "[aria-label='Cerrar']",

        ".close",

        ".modal-close"

    ];

    for (const selector of botonesCerrar) {

        try {

            const botones =
                pagina.locator(selector);

            const cantidad =
                await botones.count();

            for (
                let i = 0;
                i < cantidad;
                i++
            ) {

                const boton =
                    botones.nth(i);

                if (
                    await boton
                        .isVisible()
                        .catch(() => false)
                ) {

                    console.log(
                        "🧹 Cerrando modal:",
                        selector
                    );

                    await boton
                        .click({
                            force: true
                        })
                        .catch(() => {});

                    await pagina.waitForTimeout(500);
                }
            }

        } catch (e) {

            // Ignorar errores de selectores
        }
    }

    // Intentar quitar overlays
    try {

        await pagina.evaluate(() => {

            const elementos =
                document.querySelectorAll(
                    ".custom-modal-backdrop, " +
                    ".modal-backdrop, " +
                    ".modal-backdrop.show"
                );

            elementos.forEach(el => {

                el.style.display = "none";
                el.style.pointerEvents = "none";

            });

        });

    } catch (e) {}

    await pagina.waitForTimeout(500);
}

// ======================================================
// ABRIR CONSULTA PÚBLICA
// ======================================================

async function abrirConsultaPublica() {

    console.log(
        "🌐 Entrando al portal SEP..."
    );

    // --------------------------------------------------
    // ENTRAR AL PORTAL PRINCIPAL
    // --------------------------------------------------

    await page.goto(
        "https://profesiones.sep.gob.mx/",
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    await page.waitForTimeout(3000);

    console.log(
        "📄 Portal SEP cargado"
    );

    // --------------------------------------------------
    // DEBUG: MOSTRAR LINKS
    // --------------------------------------------------

    console.log(
        "========== LINKS SEP =========="
    );

    const links =
        await page
            .locator("a")
            .evaluateAll(elements =>
                elements.map(a => ({
                    texto:
                        a.innerText
                            ?.trim(),

                    href:
                        a.href,

                    target:
                        a.target
                }))
            );

    console.log(
        JSON.stringify(
            links,
            null,
            2
        )
    );

    console.log(
        "================================"
    );

    // --------------------------------------------------
    // BUSCAR CONSULTA PÚBLICA
    // --------------------------------------------------

    const enlace =
        page.locator(
            'a[href="https://cedulaprofesional.sep.gob.mx/"]'
        ).first();

    await enlace.waitFor({
        state: "visible",
        timeout: 30000
    });

    console.log(
        "🔗 Enlace de consulta encontrado"
    );

    // --------------------------------------------------
    // PREPARAR DETECCIÓN DE NUEVA PÁGINA
    // --------------------------------------------------

    const paginasAntes =
        context.pages();

    const popupPromise =
        page.waitForEvent(
            "popup",
            {
                timeout: 10000
            }
        )
        .catch(() => null);

    // --------------------------------------------------
    // HACER CLICK
    // --------------------------------------------------

    await enlace.click({
        force: true,
        timeout: 30000
    });

    console.log(
        "🖱️ Click realizado"
    );

    // --------------------------------------------------
    // ESPERAR POPUP
    // --------------------------------------------------

    const popup =
        await popupPromise;

    let paginaConsulta = null;

    if (popup) {

        console.log(
            "🪟 Consulta abierta en popup"
        );

        paginaConsulta =
            popup;

    } else {

        console.log(
            "📑 No hubo popup, revisando navegación..."
        );

        await page.waitForTimeout(5000);

        const paginasDespues =
            context.pages();

        if (
            paginasDespues.length >
            paginasAntes.length
        ) {

            paginaConsulta =
                paginasDespues[
                    paginasDespues.length - 1
                ];

            console.log(
                "🪟 Nueva página detectada:",
                paginaConsulta.url()
            );

        } else {

            paginaConsulta =
                page;

            console.log(
                "📄 Se utilizará la página actual"
            );
        }
    }

    // ==================================================
    // IMPORTANTE:
    // NO ESPERAR DOMCONTENTLOADED
    // ==================================================

    console.log(
        "🌐 Esperando portal de Consulta Pública..."
    );

    try {

        await paginaConsulta.waitForLoadState(
            "commit",
            {
                timeout: 15000
            }
        );

    } catch (e) {

        console.log(
            "⚠️ Commit no detectado, continuando..."
        );
    }

    // --------------------------------------------------
    // ESPERAR A QUE LA URL SEA LA DE CÉDULA
    // --------------------------------------------------

    try {

        await paginaConsulta.waitForURL(
            /cedulaprofesional\.sep\.gob\.mx/i,
            {
                timeout: 30000
            }
        );

    } catch (e) {

        console.log(
            "⚠️ La URL todavía no coincide"
        );
    }

    // --------------------------------------------------
    // ESPERA MANUAL
    // --------------------------------------------------

    await paginaConsulta.waitForTimeout(
        8000
    );

    console.log(
        "🌐 URL consulta:",
        paginaConsulta.url()
    );

    console.log(
        "📄 Título:",
        await paginaConsulta
            .title()
            .catch(() => "Sin título")
    );

    // ==================================================
    // DEBUG DE INPUTS
    // ==================================================

    try {

        const inputs =
            await paginaConsulta
                .locator("input")
                .evaluateAll(elements =>
                    elements.map(
                        (input, index) => ({
                            index,

                            id:
                                input.id,

                            name:
                                input.name,

                            type:
                                input.type,

                            placeholder:
                                input.placeholder,

                            value:
                                input.value,

                            aria:
                                input.getAttribute(
                                    "aria-label"
                                ),

                            visible:
                                !!(
                                    input.offsetWidth ||
                                    input.offsetHeight ||
                                    input.getClientRects()
                                        .length
                                )
                        })
                    )
                );

        console.log(
            "========== INPUTS CONSULTA =========="
        );

        console.log(
            JSON.stringify(
                inputs,
                null,
                2
            )
        );

        console.log(
            "======================================"
        );

    } catch (e) {

        console.log(
            "⚠️ No se pudieron analizar inputs:",
            e.message
        );
    }

    return paginaConsulta;
}

// ======================================================
// SELECCIONAR CONSULTA POR CÉDULA
// ======================================================

async function seleccionarCedula(pagina) {

    console.log(
        "🔎 Buscando opción Número de cédula..."
    );

    await cerrarModales(
        pagina
    );

    // --------------------------------------------------
    // DEBUG DE TEXTO
    // --------------------------------------------------

    try {

        const texto =
            await pagina
                .locator("body")
                .innerText();

        console.log(
            "========== TEXTO CONSULTA =========="
        );

        console.log(
            texto.substring(
                0,
                10000
            )
        );

        console.log(
            "===================================="
        );

    } catch (e) {}

    // --------------------------------------------------
    // SELECTORES
    // --------------------------------------------------

    const selectores = [

        'a[href="#tab-01"]',

        '[href="#tab-01"]',

        'a:has-text("Número de cédula")',

        'a:has-text("Numero de cedula")',

        'button:has-text("Número de cédula")',

        'button:has-text("Numero de cedula")',

        'text=Número de cédula',

        'text=Numero de cedula',

        '[role="tab"]:has-text("Número de cédula")',

        '[role="tab"]:has-text("Numero de cedula")'

    ];

    for (const selector of selectores) {

        try {

            const elemento =
                pagina
                    .locator(selector)
                    .first();

            if (
                await elemento
                    .isVisible()
                    .catch(() => false)
            ) {

                console.log(
                    "🟢 Opción encontrada:",
                    selector
                );

                await elemento.click({
                    force: true
                });

                await pagina.waitForTimeout(
                    1500
                );

                console.log(
                    "🟢 Opción cédula seleccionada"
                );

                return true;
            }

        } catch (e) {}
    }

    // --------------------------------------------------
    // JAVASCRIPT
    // --------------------------------------------------

    console.log(
        "⚠️ No se encontró por selector. " +
        "Intentando JavaScript..."
    );

    const resultadoJS =
        await pagina.evaluate(() => {

            const elementos =
                Array.from(
                    document.querySelectorAll(
                        "a, button, div, span, label"
                    )
                );

            for (
                const elemento
                of elementos
            ) {

                const texto =
                    elemento.textContent
                        ?.trim()
                        .toLowerCase();

                if (!texto) continue;

                if (
                    texto.includes(
                        "número de cédula"
                    ) ||
                    texto.includes(
                        "numero de cedula"
                    )
                ) {

                    elemento.click();

                    return true;
                }
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

    if (resultadoJS) {

        console.log(
            "🟢 Opción cédula seleccionada mediante JavaScript"
        );

        await pagina.waitForTimeout(
            2000
        );

        return true;
    }

    // --------------------------------------------------
    // SI NO EXISTE, NO FALLAR TODAVÍA
    // --------------------------------------------------

    console.log(
        "⚠️ No se encontró una pestaña explícita de cédula."
    );

    console.log(
        "🔎 Verificando si el campo ya está disponible..."
    );

    const campo =
        await encontrarCampoCedula(
            pagina
        );

    if (campo) {

        console.log(
            "🟢 El campo de cédula ya está disponible."
        );

        return true;
    }

    throw new Error(
        "No se encontró la opción de consulta por cédula"
    );
}

// ======================================================
// ENCONTRAR CAMPO CÉDULA
// ======================================================

async function encontrarCampoCedula(pagina) {

    console.log(
        "🔍 Buscando campo de cédula..."
    );

    const selectores = [

        "#cedula",

        'input[id="cedula"]',

        'input[name="cedula"]',

        'input[name="numeroCedula"]',

        'input[name="numero_cedula"]',

        'input[name="numCedula"]',

        'input[placeholder="Cédula"]',

        'input[placeholder*="Cédula" i]',

        'input[placeholder*="cedula" i]',

        'input[aria-label*="Cédula" i]',

        'input[aria-label*="cedula" i]',

        'input[type="text"]',

        'input[type="number"]'

    ];

    for (
        const selector
        of selectores
    ) {

        try {

            const elementos =
                pagina.locator(
                    selector
                );

            const cantidad =
                await elementos.count();

            console.log(
                `Selector ${selector}: ${cantidad}`
            );

            for (
                let i = 0;
                i < cantidad;
                i++
            ) {

                const elemento =
                    elementos.nth(i);

                const visible =
                    await elemento
                        .isVisible()
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

    // ==================================================
    // ANALIZAR TODOS LOS INPUTS
    // ==================================================

    console.log(
        "🔎 Analizando todos los inputs..."
    );

    try {

        const inputs =
            pagina.locator("input");

        const total =
            await inputs.count();

        console.log(
            "TOTAL INPUTS:",
            total
        );

        for (
            let i = 0;
            i < total;
            i++
        ) {

            const input =
                inputs.nth(i);

            try {

                if (
                    !(await input.isVisible())
                ) {
                    continue;
                }

                const info = {

                    id:
                        await input
                            .getAttribute("id"),

                    name:
                        await input
                            .getAttribute("name"),

                    placeholder:
                        await input
                            .getAttribute(
                                "placeholder"
                            ),

                    type:
                        await input
                            .getAttribute("type"),

                    aria:
                        await input
                            .getAttribute(
                                "aria-label"
                            ),

                    class:
                        await input
                            .getAttribute(
                                "class"
                            )
                };

                console.log(
                    "INPUT",
                    i,
                    info
                );

                const texto =
                    JSON.stringify(
                        info
                    ).toLowerCase();

                if (
                    texto.includes("cedula") ||
                    texto.includes("cédula") ||
                    texto.includes("numero")
                ) {

                    console.log(
                        "🟢 Campo identificado por atributos"
                    );

                    return input;
                }

            } catch (e) {}
        }

    } catch (e) {

        console.log(
            "⚠️ Error analizando inputs:",
            e.message
        );
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

    const limite =
        Date.now() + 45000;

    while (
        Date.now() < limite
    ) {

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

        await pagina.waitForTimeout(
            1500
        );
    }

    // ==================================================
    // DEBUG FINAL
    // ==================================================

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

    try {

        const html =
            await pagina
                .locator("body")
                .innerText();

        console.log(
            "========== BODY FINAL =========="
        );

        console.log(
            html.substring(
                0,
                15000
            )
        );

        console.log(
            "================================"
        );

    } catch (e) {}

    throw new Error(
        "No se encontró el campo de cédula"
    );
}

// ======================================================
// ENCONTRAR BOTÓN BUSCAR
// ======================================================

async function encontrarBotonBuscar(pagina) {

    console.log(
        "🔍 Buscando botón Buscar..."
    );

    const selectores = [

        "button:has-text('Buscar')",

        "button:has-text('BUSCAR')",

        "button:has-text('buscar')",

        'button[type="submit"]',

        'input[type="submit"]',

        '[type="button"]:has-text("Buscar")',

        '[role="button"]:has-text("Buscar")'

    ];

    for (
        const selector
        of selectores
    ) {

        try {

            const botones =
                pagina.locator(
                    selector
                );

            const cantidad =
                await botones.count();

            for (
                let i = 0;
                i < cantidad;
                i++
            ) {

                const boton =
                    botones.nth(i);

                if (
                    await boton
                        .isVisible()
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

    // ==================================================
    // BUSCAR POR TEXTO
    // ==================================================

    try {

        const botones =
            pagina.locator(
                "button, input, a"
            );

        const total =
            await botones.count();

        for (
            let i = 0;
            i < total;
            i++
        ) {

            const boton =
                botones.nth(i);

            try {

                if (
                    !(await boton.isVisible())
                ) {
                    continue;
                }

                const texto =
                    (
                        await boton
                            .innerText()
                            .catch(() => "")
                    )
                        .trim()
                        .toLowerCase();

                const value =
                    (
                        await boton
                            .getAttribute("value")
                            .catch(() => "")
                    )
                        ?.trim()
                        .toLowerCase();

                if (
                    texto.includes("buscar") ||
                    value?.includes("buscar")
                ) {

                    console.log(
                        "🟢 Botón encontrado por texto"
                    );

                    return boton;
                }

            } catch (e) {}
        }

    } catch (e) {}

    return null;
}

// ======================================================
// EXTRAER RESULTADO
// ======================================================

async function extraerResultado(pagina) {

    console.log(
        "🔎 Buscando resultados..."
    );

    await pagina.waitForTimeout(
        3000
    );

    const limite =
        Date.now() + 30000;

    while (
        Date.now() < limite
    ) {

        // ------------------------------------------------
        // TABLAS
        // ------------------------------------------------

        try {

            const filas =
                pagina.locator(
                    "tbody tr"
                );

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

                    fuente:
                        "SEP"

                };
            }

        } catch (e) {}

        // ------------------------------------------------
        // MENSAJE NO ENCONTRADO
        // ------------------------------------------------

        try {

            const body =
                (
                    await pagina
                        .locator("body")
                        .innerText()
                )
                    .toLowerCase();

            if (

                body.includes(
                    "no se encontraron"
                ) ||

                body.includes(
                    "no se encontró"
                ) ||

                body.includes(
                    "no encontrada"
                ) ||

                body.includes(
                    "sin resultados"
                )

            ) {

                console.log(
                    "ℹ️ Cédula no encontrada"
                );

                return null;
            }

        } catch (e) {}

        await pagina.waitForTimeout(
            1500
        );
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

    // --------------------------------------------------
    // ABRIR CONSULTA
    // --------------------------------------------------

    const pagina =
        await abrirConsultaPublica();

    // --------------------------------------------------
    // SELECCIONAR CÉDULA
    // --------------------------------------------------

    await seleccionarCedula(
        pagina
    );

    // --------------------------------------------------
    // ENCONTRAR CAMPO
    // --------------------------------------------------

    const campo =
        await esperarFormularioCedula(
            pagina
        );

    // --------------------------------------------------
    // ESCRIBIR CÉDULA
    // --------------------------------------------------

    await campo.fill(
        String(cedula)
    );

    console.log(
        "✍️ Cédula escrita:",
        cedula
    );

    // --------------------------------------------------
    // BOTÓN
    // --------------------------------------------------

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

    await boton.click({
        force: true,
        timeout: 30000
    });

    console.log(
        "⏳ Esperando resultados..."
    );

    // --------------------------------------------------
    // EXTRAER
    // --------------------------------------------------

    const resultado =
        await extraerResultado(
            pagina
        );

    return resultado;
}

// ======================================================
// ENDPOINT
// ======================================================

app.post(
    "/validar-cedula",
    async (req, res) => {

        const {
            cedula
        } = req.body;

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

            await cerrarBrowser();

            // ------------------------------------------------
            // REINICIAR
            // ------------------------------------------------

            try {

                await iniciarBrowser();

            } catch (e) {

                console.error(
                    "❌ No se pudo reiniciar Chromium:",
                    e.message
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

            status:
                "ok",

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