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

// ======================================================
// CONFIGURACIÓN
// ======================================================

const SEP_HOME =
    "https://profesiones.sep.gob.mx/";

const SEP_CONSULTA =
    "https://cedulaprofesional.sep.gob.mx/";

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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

        ignoreHTTPSErrors: true
    });

    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(60000);

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
}

// ======================================================
// CREAR PÁGINA
// ======================================================

async function crearPagina() {

    if (!browser || !browser.isConnected()) {
        await iniciarBrowser();
    }

    const pagina =
        await context.newPage();

    pagina.setDefaultTimeout(30000);
    pagina.setDefaultNavigationTimeout(60000);

    return pagina;
}

// ======================================================
// CERRAR MODALES
// ======================================================

async function cerrarModales(pagina) {

    try {

        const selectores = [

            "button:has-text('×')",
            "button:has-text('Cerrar')",
            "button:has-text('CERRAR')",
            "[aria-label='Close']",
            "[aria-label='Cerrar']",
            ".close",
            ".modal-close"

        ];

        for (const selector of selectores) {

            try {

                const elementos =
                    pagina.locator(selector);

                const total =
                    await elementos.count();

                for (let i = 0; i < total; i++) {

                    const elemento =
                        elementos.nth(i);

                    if (
                        await elemento
                            .isVisible()
                            .catch(() => false)
                    ) {

                        await elemento
                            .click({
                                force: true
                            })
                            .catch(() => {});

                        await pagina.waitForTimeout(300);
                    }
                }

            } catch (e) {}
        }

    } catch (e) {}

    // Ocultar overlays conocidos
    try {

        await pagina.evaluate(() => {

            const elementos =
                document.querySelectorAll(
                    ".modal-backdrop, " +
                    ".custom-modal-backdrop"
                );

            elementos.forEach(el => {

                el.style.display = "none";
                el.style.visibility = "hidden";
                el.style.pointerEvents = "none";

            });

        });

    } catch (e) {}
}

// ======================================================
// ABRIR CONSULTA PÚBLICA
// ======================================================

async function abrirConsultaPublica() {

    console.log(
        "🌐 Entrando al portal SEP..."
    );

    const pagina =
        await crearPagina();

    // ==================================================
    // ENTRAR DIRECTAMENTE A CONSULTA PÚBLICA
    // ==================================================

    console.log(
        "🌐 Abriendo Consulta Pública directamente..."
    );

    await pagina.goto(
        SEP_CONSULTA,
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    console.log(
        "📄 Consulta Pública cargada"
    );

    console.log(
        "🌐 URL:",
        pagina.url()
    );

    await pagina.waitForTimeout(5000);

    // ==================================================
    // DEBUG DE LA PÁGINA
    // ==================================================

    try {

        console.log(
            "📄 TÍTULO:",
            await pagina.title()
        );

        const texto =
            await pagina
                .locator("body")
                .innerText()
                .catch(() => "");

        console.log(
            "📝 TEXTO INICIAL SEP:"
        );

        console.log(
            texto.substring(0, 3000)
        );

    } catch (e) {}

    // ==================================================
    // CERRAR MODALES
    // ==================================================

    await cerrarModales(
        pagina
    );

    return pagina;
}

// ======================================================
// MOSTRAR FORMULARIOS
// ======================================================

async function debugInputs(pagina) {

    console.log(
        "========== INPUTS SEP =========="
    );

    try {

        const inputs =
            await pagina.locator("input")
                .evaluateAll(elements =>
                    elements.map((input, index) => ({

                        index,

                        id:
                            input.id,

                        name:
                            input.getAttribute("name"),

                        type:
                            input.type,

                        placeholder:
                            input.getAttribute(
                                "placeholder"
                            ),

                        aria:
                            input.getAttribute(
                                "aria-label"
                            ),

                        value:
                            input.value,

                        visible:
                            !!(
                                input.offsetWidth ||
                                input.offsetHeight ||
                                input.getClientRects().length
                            )

                    }))
                );

        console.log(
            JSON.stringify(
                inputs,
                null,
                2
            )
        );

    } catch (e) {

        console.log(
            "⚠️ Error leyendo inputs:",
            e.message
        );
    }

    console.log(
        "================================"
    );
}

// ======================================================
// SELECCIONAR OPCIÓN DE CÉDULA
// ======================================================

async function seleccionarCedula(pagina) {

    console.log(
        "🔎 Buscando opción Número de cédula..."
    );

    await cerrarModales(
        pagina
    );

    // ==================================================
    // PRIMERO: VER SI YA ESTÁ EL INPUT
    // ==================================================

    const inputs =
        pagina.locator("input");

    const totalInputs =
        await inputs.count();

    console.log(
        "🔢 Inputs actuales:",
        totalInputs
    );

    for (let i = 0; i < totalInputs; i++) {

        const input =
            inputs.nth(i);

        try {

            if (
                !(await input.isVisible())
            ) {
                continue;
            }

            const atributos = {

                id:
                    await input.getAttribute("id"),

                name:
                    await input.getAttribute("name"),

                placeholder:
                    await input.getAttribute(
                        "placeholder"
                    ),

                aria:
                    await input.getAttribute(
                        "aria-label"
                    )

            };

            const texto =
                JSON.stringify(
                    atributos
                ).toLowerCase();

            if (
                texto.includes("cedula") ||
                texto.includes("cédula")
            ) {

                console.log(
                    "🟢 Ya existe campo de cédula"
                );

                return true;
            }

        } catch (e) {}
    }

    // ==================================================
    // BUSCAR ENLACES / BOTONES
    // ==================================================

    const candidatos = [

        "text=Número de cédula",

        "text=Numero de cedula",

        "text=Cédula profesional",

        "text=Cedula profesional",

        "a:has-text('Número de cédula')",

        "a:has-text('Numero de cedula')",

        "button:has-text('Número de cédula')",

        "button:has-text('Numero de cedula')",

        "[href='#tab-01']",

        "[href='#cedula']"

    ];

    for (const selector of candidatos) {

        try {

            const elemento =
                pagina
                    .locator(selector)
                    .first();

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
                }).catch(() => {});

                await pagina.waitForTimeout(
                    2000
                );

                return true;
            }

        } catch (e) {}
    }

    // ==================================================
    // BUSCAR TEXTO MEDIANTE JAVASCRIPT
    // ==================================================

    console.log(
        "⚠️ No encontrada por selector."
    );

    console.log(
        "🔍 Buscando mediante JavaScript..."
    );

    const resultado =
        await pagina.evaluate(() => {

            const elementos =
                Array.from(
                    document.querySelectorAll(
                        "a, button, div, span, label"
                    )
                );

            const encontrado =
                elementos.find(elemento => {

                    const texto =
                        (
                            elemento.textContent ||
                            ""
                        )
                            .trim()
                            .toLowerCase();

                    return (
                        texto ===
                        "número de cédula" ||

                        texto ===
                        "numero de cedula" ||

                        texto.includes(
                            "número de cédula"
                        ) ||

                        texto.includes(
                            "numero de cedula"
                        )
                    );

                });

            if (encontrado) {

                encontrado.click();

                return true;
            }

            return false;

        });

    if (resultado) {

        console.log(
            "🟢 Opción encontrada mediante JavaScript"
        );

        await pagina.waitForTimeout(
            2000
        );

        return true;
    }

    // ==================================================
    // DEBUG
    // ==================================================

    await debugInputs(
        pagina
    );

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

        "#Cedula",

        "#numeroCedula",

        "#numero_cedula",

        "#txtCedula",

        "#txtNumeroCedula",

        'input[name="cedula"]',

        'input[name="Cedula"]',

        'input[name="numeroCedula"]',

        'input[name="numero_cedula"]',

        'input[name="numCedula"]',

        'input[placeholder*="cédula" i]',

        'input[placeholder*="cedula" i]',

        'input[aria-label*="cédula" i]',

        'input[aria-label*="cedula" i]'

    ];

    for (const selector of selectores) {

        try {

            const elemento =
                pagina
                    .locator(selector)
                    .first();

            if (
                await elemento.isVisible()
                    .catch(() => false)
            ) {

                console.log(
                    "🟢 Campo encontrado:",
                    selector
                );

                return elemento;
            }

        } catch (e) {}
    }

    // ==================================================
    // BUSCAR TODOS LOS INPUTS
    // ==================================================

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

            if (
                !(await input.isVisible())
            ) {
                continue;
            }

            const info = {

                id:
                    await input.getAttribute(
                        "id"
                    ),

                name:
                    await input.getAttribute(
                        "name"
                    ),

                placeholder:
                    await input.getAttribute(
                        "placeholder"
                    ),

                type:
                    await input.getAttribute(
                        "type"
                    ),

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
                JSON.stringify(
                    info
                ).toLowerCase();

            if (
                texto.includes("cedula") ||
                texto.includes("cédula")
            ) {

                console.log(
                    "🟢 Campo identificado"
                );

                return input;
            }

        } catch (e) {}
    }

    // ==================================================
    // ÚLTIMO RECURSO:
    // INPUT TEXT VISIBLE
    // ==================================================

    for (let i = 0; i < total; i++) {

        const input =
            inputs.nth(i);

        try {

            if (
                await input.isVisible()
            ) {

                const type =
                    await input.getAttribute(
                        "type"
                    );

                if (
                    !type ||
                    type === "text" ||
                    type === "number"
                ) {

                    console.log(
                        "🟡 Usando input de texto visible:",
                        i
                    );

                    return input;
                }
            }

        } catch (e) {}
    }

    return null;
}

// ======================================================
// ESPERAR CAMPO CÉDULA
// ======================================================

async function esperarCampoCedula(pagina) {

    console.log(
        "⏳ Esperando campo de cédula..."
    );

    const limite =
        Date.now() + 45000;

    while (
        Date.now() < limite
    ) {

        await cerrarModales(
            pagina
        );

        const campo =
            await encontrarCampoCedula(
                pagina
            );

        if (campo) {

            console.log(
                "🟢 Campo de cédula listo"
            );

            return campo;
        }

        await pagina.waitForTimeout(
            1500
        );
    }

    console.log(
        "❌ Campo de cédula no apareció"
    );

    await debugInputs(
        pagina
    );

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

        "input[type='submit']",

        "button[type='submit']",

        "[type='button']:has-text('Buscar')",

        "a:has-text('Buscar')"

    ];

    for (const selector of selectores) {

        try {

            const botones =
                pagina.locator(
                    selector
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

                if (
                    await boton
                        .isVisible()
                        .catch(() => false)
                ) {

                    console.log(
                        "🟢 Botón encontrado:",
                        selector
                    );

                    return boton;
                }
            }

        } catch (e) {}
    }

    // ==================================================
    // JAVASCRIPT
    // ==================================================

    const encontrado =
        await pagina.evaluate(() => {

            const elementos =
                Array.from(
                    document.querySelectorAll(
                        "button, input, a"
                    )
                );

            const boton =
                elementos.find(
                    elemento => {

                        const texto =
                            (
                                elemento.innerText ||
                                elemento.value ||
                                elemento.textContent ||
                                ""
                            )
                                .trim()
                                .toLowerCase();

                        return texto === "buscar" ||
                            texto.includes("buscar");
                    }
                );

            if (boton) {

                return true;
            }

            return false;
        });

    if (encontrado) {

        const botones =
            pagina.locator(
                "button, input, a"
            );

        const total =
            await botones.count();

        for (let i = 0; i < total; i++) {

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

                    return boton;
                }

            } catch (e) {}
        }
    }

    return null;
}

// ======================================================
// EXTRAER RESULTADO
// ======================================================

async function extraerResultado(
    pagina,
    cedula
) {

    console.log(
        "🔎 Buscando resultados..."
    );

    const limite =
        Date.now() + 30000;

    while (
        Date.now() < limite
    ) {

        await pagina.waitForTimeout(
            1500
        );

        // ==================================================
        // BUSCAR TABLAS
        // ==================================================

        try {

            const filas =
                pagina.locator(
                    "tbody tr"
                );

            const total =
                await filas.count();

            console.log(
                "📊 Filas:",
                total
            );

            if (total > 0) {

                const fila =
                    filas.first();

                const data =
                    await fila
                        .locator("td")
                        .allTextContents();

                console.log(
                    "📋 DATOS:",
                    data
                );

                if (
                    data.length > 0
                ) {

                    return {

                        success: true,

                        valida: true,

                        numeroCedula:
                            data[0]?.trim() ||
                            String(cedula),

                        nombre:
                            data[1]?.trim() ||
                            "",

                        apellidoPaterno:
                            data[2]?.trim() ||
                            "",

                        apellidoMaterno:
                            data[3]?.trim() ||
                            "",

                        genero:
                            data[4]?.trim() ||
                            "",

                        institucion:
                            data[5]?.trim() ||
                            "",

                        profesion:
                            data[6]?.trim() ||
                            "",

                        entidad:
                            data[7]?.trim() ||
                            "",

                        anioRegistro:
                            data[8]?.trim() ||
                            "",

                        fechaConsulta:
                            new Date()
                                .toISOString(),

                        fuente:
                            "SEP"

                    };
                }
            }

        } catch (e) {}

        // ==================================================
        // BUSCAR MENSAJES DE ERROR / NO ENCONTRADO
        // ==================================================

        try {

            const texto =
                (
                    await pagina
                        .locator("body")
                        .innerText()
                )
                    .toLowerCase();

            if (

                texto.includes(
                    "no se encontraron"
                ) ||

                texto.includes(
                    "no se encontró"
                ) ||

                texto.includes(
                    "no encontrada"
                ) ||

                texto.includes(
                    "sin resultados"
                ) ||

                texto.includes(
                    "no existen resultados"
                )
            ) {

                console.log(
                    "ℹ️ Cédula no encontrada"
                );

                return null;
            }

        } catch (e) {}
    }

    // ==================================================
    // DEBUG FINAL
    // ==================================================

    try {

        const texto =
            await pagina
                .locator("body")
                .innerText();

        console.log(
            "========== TEXTO FINAL =========="
        );

        console.log(
            texto.substring(0, 5000)
        );

        console.log(
            "================================="
        );

    } catch (e) {}

    return null;
}

// ======================================================
// CONSULTAR CÉDULA
// ======================================================

async function consultarCedula(
    cedula
) {

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

    try {

        // ==================================================
        // SELECCIONAR CÉDULA
        // ==================================================

        await seleccionarCedula(
            pagina
        );

        // ==================================================
        // ESPERAR CAMPO
        // ==================================================

        const campo =
            await esperarCampoCedula(
                pagina
            );

        // ==================================================
        // ESCRIBIR CÉDULA
        // ==================================================

        await campo.fill(
            String(cedula)
        );

        console.log(
            "✍️ Cédula escrita:",
            cedula
        );

        await pagina.waitForTimeout(
            500
        );

        // ==================================================
        // BUSCAR BOTÓN
        // ==================================================

        const boton =
            await encontrarBotonBuscar(
                pagina
            );

        if (!boton) {

            throw new Error(
                "No se encontró el botón Buscar"
            );
        }

        // ==================================================
        // CLICK
        // ==================================================

        console.log(
            "🔍 Ejecutando búsqueda..."
        );

        await boton.click({
            force: true
        });

        console.log(
            "⏳ Esperando resultados..."
        );

        // ==================================================
        // RESULTADO
        // ==================================================

        const resultado =
            await extraerResultado(
                pagina,
                cedula
            );

        return resultado;

    } finally {

        try {

            await pagina.close();

        } catch (e) {}
    }
}

// ======================================================
// ENDPOINT
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

            // ==================================================
            // REINICIAR BROWSER
            // ==================================================

            await cerrarBrowser();

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