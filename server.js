process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/render/project/.playwright";

import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const SEP_HOME = "https://profesiones.sep.gob.mx/";
const SEP_CONSULTA = "https://cedulaprofesional.sep.gob.mx/";

let browser = null;
let context = null;
let page = null;

async function iniciarBrowser() {
    if (browser && browser.isConnected()) return;

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
        viewport: { width: 1366, height: 768 },
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

async function cerrarBrowser() {
    try {
        if (context) await context.close();
    } catch (e) {
        console.log("⚠️ Error cerrando context:", e.message);
    }

    try {
        if (browser) await browser.close();
    } catch (e) {
        console.log("⚠️ Error cerrando browser:", e.message);
    }

    browser = null;
    context = null;
    page = null;
}

async function cerrarModales(pagina) {
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
            const elementos = pagina.locator(selector);
            const total = await elementos.count();

            for (let i = 0; i < total; i++) {
                const elemento = elementos.nth(i);

                if (await elemento.isVisible().catch(() => false)) {
                    await elemento.click({ force: true }).catch(() => {});
                }
            }
        } catch (e) {}
    }

    try {
        await pagina.evaluate(() => {
            document
                .querySelectorAll(
                    ".modal-backdrop, .custom-modal-backdrop, .modal-backdrop.show"
                )
                .forEach(el => {
                    el.style.display = "none";
                    el.style.pointerEvents = "none";
                });
        });
    } catch (e) {}
}

async function mostrarEstado(pagina, etiqueta) {
    console.log(`\n========== ${etiqueta} ==========`);

    console.log("URL:", pagina.url());

    try {
        console.log("TITLE:", await pagina.title());
    } catch (e) {
        console.log("TITLE: no disponible");
    }

    try {
        const texto = await pagina.locator("body").innerText();
        console.log(texto.substring(0, 6000));
    } catch (e) {
        console.log("No se pudo obtener body:", e.message);
    }

    console.log("================================\n");
}

async function abrirConsultaPublica() {
    console.log("🌐 Abriendo portal SEP...");

    await page.goto(SEP_HOME, {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });

    await page.waitForTimeout(3000);

    console.log("📄 Portal SEP cargado");
    console.log("URL inicial:", page.url());

    const enlace = page.locator(
        `a[href="${SEP_CONSULTA}"]`
    ).first();

    const existe = await enlace.count();

    console.log("🔗 Enlace Consulta Pública encontrado:", existe > 0);

    if (existe > 0) {
        console.log("🎯 Intentando abrir Consulta Pública...");

        const paginasAntes = context.pages();

        let popup = null;

        try {
            popup = await Promise.race([
                page.waitForEvent("popup", { timeout: 10000 }),
                new Promise(resolve => setTimeout(() => resolve(null), 10000))
            ]);
        } catch (e) {
            popup = null;
        }

        await enlace.click({
            force: true,
            timeout: 30000
        }).catch(e => {
            console.log("⚠️ Click produjo error:", e.message);
        });

        await page.waitForTimeout(5000);

        const paginasDespues = context.pages();

        console.log(
            "📄 Páginas antes:",
            paginasAntes.length,
            "después:",
            paginasDespues.length
        );

        if (popup) {
            console.log("🪟 Popup detectado");
            page = popup;
        } else if (paginasDespues.length > paginasAntes.length) {
            page = paginasDespues[paginasDespues.length - 1];
            console.log("🪟 Nueva página detectada");
        } else if (page.url() === SEP_CONSULTA) {
            console.log("🟢 La página actual navegó a Consulta Pública");
        } else {
            console.log("⚠️ El clic NO abrió Consulta Pública");
            console.log("URL después del clic:", page.url());
        }
    }

    if (page.url() !== SEP_CONSULTA) {
        console.log("➡️ Abriendo Consulta Pública directamente...");

        try {
            await page.goto(SEP_CONSULTA, {
                waitUntil: "domcontentloaded",
                timeout: 60000
            });
        } catch (e) {
            console.log(
                "⚠️ goto directo terminó con:",
                e.message
            );
        }
    }

    await page.waitForTimeout(8000);

    await mostrarEstado(
        page,
        "ESTADO REAL CONSULTA PÚBLICA"
    );

    return page;
}

async function analizarPagina(pagina) {
    console.log("🔬 Analizando elementos de la página...");

    try {
        const elementos = await pagina.locator("input, button, a, select").evaluateAll(
            elements =>
                elements.map((el, index) => ({
                    index,
                    tag: el.tagName,
                    id: el.id || "",
                    name: el.getAttribute("name") || "",
                    type: el.getAttribute("type") || "",
                    placeholder: el.getAttribute("placeholder") || "",
                    aria: el.getAttribute("aria-label") || "",
                    value: el.getAttribute("value") || "",
                    text: (el.innerText || el.textContent || "")
                        .trim()
                        .replace(/\s+/g, " ")
                        .substring(0, 200),
                    href: el.getAttribute("href") || "",
                    visible: !!(
                        el.offsetWidth ||
                        el.offsetHeight ||
                        el.getClientRects().length
                    )
                }))
        );

        console.log(
            JSON.stringify(elementos, null, 2)
        );
    } catch (e) {
        console.log(
            "⚠️ Error analizando página:",
            e.message
        );
    }
}

async function encontrarCampoCedula(pagina) {
    console.log("🔍 Buscando campo de cédula...");

    const selectores = [
        "#cedula",
        "#numeroCedula",
        "#numCedula",
        'input[name="cedula"]',
        'input[name="numeroCedula"]',
        'input[name="numCedula"]',
        'input[placeholder*="cédula" i]',
        'input[placeholder*="cedula" i]',
        'input[aria-label*="cédula" i]',
        'input[aria-label*="cedula" i]'
    ];

    for (const selector of selectores) {
        try {
            const elemento = pagina.locator(selector).first();

            if (
                await elemento.count() > 0 &&
                await elemento.isVisible().catch(() => false)
            ) {
                console.log("🟢 Campo encontrado:", selector);
                return elemento;
            }
        } catch (e) {}
    }

    try {
        const inputs = pagina.locator("input");
        const total = await inputs.count();

        console.log("📋 Total inputs:", total);

        for (let i = 0; i < total; i++) {
            const input = inputs.nth(i);

            if (!await input.isVisible().catch(() => false)) {
                continue;
            }

            const info = {
                id: await input.getAttribute("id"),
                name: await input.getAttribute("name"),
                type: await input.getAttribute("type"),
                placeholder: await input.getAttribute("placeholder"),
                aria: await input.getAttribute("aria-label"),
                class: await input.getAttribute("class")
            };

            console.log(`INPUT ${i}:`, info);

            const texto = JSON.stringify(info).toLowerCase();

            if (
                texto.includes("cedula") ||
                texto.includes("cédula") ||
                texto.includes("numero")
            ) {
                console.log("🟢 Campo identificado:", i);
                return input;
            }
        }
    } catch (e) {
        console.log("⚠️ Error revisando inputs:", e.message);
    }

    return null;
}

async function seleccionarCedula(pagina) {
    console.log("🔎 Buscando consulta por número de cédula...");

    await cerrarModales(pagina);

    const textos = [
        "Número de cédula",
        "Numero de cedula",
        "Cédula profesional",
        "Cedula profesional"
    ];

    for (const texto of textos) {
        try {
            const elementos = pagina.getByText(texto, {
                exact: false
            });

            const total = await elementos.count();

            for (let i = 0; i < total; i++) {
                const elemento = elementos.nth(i);

                if (
                    await elemento.isVisible().catch(() => false)
                ) {
                    console.log(
                        "🟢 Opción encontrada:",
                        texto
                    );

                    await elemento.click({
                        force: true
                    }).catch(() => {});

                    await pagina.waitForTimeout(2000);

                    const campo =
                        await encontrarCampoCedula(pagina);

                    if (campo) {
                        return campo;
                    }
                }
            }
        } catch (e) {}
    }

    console.log(
        "⚠️ No encontramos todavía la opción de cédula."
    );

    console.log(
        "🔬 Vamos a analizar la página REAL antes de continuar."
    );

    await analizarPagina(pagina);

    const campo = await encontrarCampoCedula(pagina);

    if (campo) return campo;

    throw new Error(
        "La página de Consulta Pública no contiene todavía un campo de cédula."
    );
}

async function encontrarBotonBuscar(pagina) {
    console.log("🔍 Buscando botón Buscar...");

    const selectores = [
        "button:has-text('Buscar')",
        "button:has-text('BUSCAR')",
        "input[type='submit']",
        "button[type='submit']",
        "[role='button']:has-text('Buscar')"
    ];

    for (const selector of selectores) {
        try {
            const elementos = pagina.locator(selector);
            const total = await elementos.count();

            for (let i = 0; i < total; i++) {
                const elemento = elementos.nth(i);

                if (
                    await elemento.isVisible().catch(() => false)
                ) {
                    console.log(
                        "🟢 Botón encontrado:",
                        selector
                    );
                    return elemento;
                }
            }
        } catch (e) {}
    }

    const elementos = pagina.locator("button, input, a");
    const total = await elementos.count();

    for (let i = 0; i < total; i++) {
        const elemento = elementos.nth(i);

        if (!await elemento.isVisible().catch(() => false)) {
            continue;
        }

        const texto = (
            await elemento.innerText().catch(() => "")
        ).trim().toLowerCase();

        const value = (
            await elemento.getAttribute("value").catch(() => "")
        )?.trim().toLowerCase();

        if (
            texto.includes("buscar") ||
            value?.includes("buscar")
        ) {
            console.log("🟢 Botón encontrado por texto");
            return elemento;
        }
    }

    return null;
}

async function esperarCampoCedula(pagina) {
    console.log("⏳ Esperando formulario de cédula...");

    const limite = Date.now() + 45000;

    while (Date.now() < limite) {
        const campo = await encontrarCampoCedula(pagina);

        if (campo) {
            console.log("🟢 Formulario de cédula listo");
            return campo;
        }

        await pagina.waitForTimeout(2000);
    }

    await analizarPagina(pagina);

    throw new Error(
        "No apareció el campo de cédula después de 45 segundos."
    );
}

async function extraerResultado(pagina) {
    console.log("🔎 Buscando resultados...");

    const limite = Date.now() + 30000;

    while (Date.now() < limite) {
        try {
            const filas = pagina.locator("tbody tr");
            const total = await filas.count();

            console.log("Filas encontradas:", total);

            if (total > 0) {
                const data = await filas
                    .first()
                    .locator("td")
                    .allTextContents();

                console.log("📋 Datos obtenidos:", data);

                return {
                    success: true,
                    valida: true,
                    numeroCedula: data[0]?.trim() || "",
                    nombre: data[1]?.trim() || "",
                    apellidoPaterno: data[2]?.trim() || "",
                    apellidoMaterno: data[3]?.trim() || "",
                    genero: data[4]?.trim() || "",
                    institucion: data[5]?.trim() || "",
                    profesion: data[6]?.trim() || "",
                    entidad: data[7]?.trim() || "",
                    anioRegistro: data[8]?.trim() || "",
                    fechaConsulta: new Date().toISOString(),
                    fuente: "SEP"
                };
            }
        } catch (e) {}

        try {
            const body = (
                await pagina.locator("body").innerText()
            ).toLowerCase();

            const noEncontrado =
                body.includes("no se encontraron") ||
                body.includes("no se encontró") ||
                body.includes("no encontrada") ||
                body.includes("sin resultados");

            if (noEncontrado) {
                console.log("ℹ️ Cédula no encontrada");
                return null;
            }
        } catch (e) {}

        await pagina.waitForTimeout(1500);
    }

    await mostrarEstado(
        pagina,
        "ESTADO DESPUÉS DE BUSCAR"
    );

    return null;
}

async function consultarCedula(cedula) {
    console.log("======================================");
    console.log("🔎 CONSULTANDO CÉDULA:", cedula);
    console.log("======================================");

    const pagina = await abrirConsultaPublica();

    const campo = await seleccionarCedula(pagina);

    await campo.fill(String(cedula));

    console.log("✍️ Cédula escrita:", cedula);

    const boton = await encontrarBotonBuscar(pagina);

    if (!boton) {
        await analizarPagina(pagina);

        throw new Error(
            "No se encontró el botón Buscar."
        );
    }

    console.log("🔍 Ejecutando búsqueda...");

    await boton.click({
        force: true,
        timeout: 30000
    });

    console.log("⏳ Esperando resultados...");

    return await extraerResultado(pagina);
}

app.post("/validar-cedula", async (req, res) => {
    const { cedula } = req.body;

    console.log("📥 Solicitud recibida:", cedula);

    if (!cedula) {
        return res.status(400).json({
            success: false,
            valida: false,
            message: "Falta cédula"
        });
    }

    try {
        await iniciarBrowser();

        const resultado = await consultarCedula(cedula);

        if (!resultado) {
            return res.json({
                success: false,
                valida: false,
                message: "No encontrada"
            });
        }

        return res.json(resultado);
    } catch (error) {
        console.error("💥 ERROR SEP:", error);

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
            message: "Error SEP",
            error: error.message
        });
    }
});

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        service: "SEP Scraper Service",
        message: "API funcionando correctamente"
    });
});

app.listen(PORT, async () => {
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
});