/**
 * CATÁLOGO CANÓNICO de países/territorios con DDI (código de llamada UIT E.164) para teléfono/celular de Clientes.
 *
 * FUENTE CANÓNICA ÚNICA: este archivo versionado en Git. Lo consumen la interfaz y todas las API (validación síncrona, sin
 * lectura de base de datos). La tabla `public.paises_telefonia` (NEX-026/NEX-027) es solo un ESPEJO para consultas SQL,
 * generado desde este archivo; su columna `activo` es informativa y NO gobierna la validación. Una baja o corrección de un
 * destino se hace aquí (nuevo commit) y en una migración/seed versionada idempotente nueva; la coincidencia se verifica con
 * la huella `HUELLA_CATALOGO_MD5` (casos en `telefono.casos.ts` + `scripts/verificar-paises-telefonia.sql`).
 *
 * Formato de cada fila: "ISO3|Nombre|DDI" o "ID|Nombre|DDI|USR[:ISO_JURISDICCION]".
 *  - ISO3 = ISO 3166-1 alpha-3 asignado. Destinos de la lista oficial UIT sin ISO propio usan un IDENTIFICADOR INTERNO del
 *    rango XAA–XZZ, que ISO 3166-1 reserva para uso del usuario (no es un código ISO oficial; marcado USR): XAC = Ascensión
 *    (+247; jurisdicción ISO SHN). XKX = Kosovo (+383), identificador usado por convención, también USR.
 *  - Diego García (+246) pertenece al Territorio Británico del Océano Índico (ISO IOT). Tristán de Acuña comparte +290 con
 *    Santa Elena (ISO SHN, que cubre Santa Elena, Ascensión y Tristán de Acuña).
 *  - Los destinos del Plan de Numeración Norteamericano (NANP) comparten el DDI "1" y se distinguen por el ISO y el código de área.
 * Contraste: lista oficial UIT "National Numbering Plans" (https://www.itu.int/oth/t0202/en, consultada 2026-10-11): todas
 * sus entradas geográficas están representadas; Vaticano figura como +39 (UIT no lista +379). NO cubre las redes globales no
 * geográficas (+870, +881, +882, +883: satélite/otras), que no son países ni territorios y quedan fuera de alcance.
 * La cobertura es la de esa lista y la de ISO 3166-1 contrastada por una compilación de Claude; no se declara integral
 * hasta que el responsable la confirme.
 */
export const HUELLA_CATALOGO_MD5 = "f46a9ca0a35b41bf6f4d8f5b0fba84e9";

export const PAISES_DDI: readonly string[] = [
  "AFG|Afganistán|93", "ALB|Albania|355", "DEU|Alemania|49", "AND|Andorra|376", "AGO|Angola|244", "AIA|Anguila|1",
  "ATG|Antigua y Barbuda|1", "SAU|Arabia Saudita|966", "DZA|Argelia|213", "ARG|Argentina|54", "ARM|Armenia|374",
  "ABW|Aruba|297", "AUS|Australia|61", "AUT|Austria|43", "AZE|Azerbaiyán|994", "BHS|Bahamas|1", "BHR|Baréin|973",
  "BGD|Bangladés|880", "BRB|Barbados|1", "BLR|Bielorrusia|375", "BEL|Bélgica|32", "BLZ|Belice|501", "BEN|Benín|229",
  "BMU|Bermudas|1", "BTN|Bután|975", "BOL|Bolivia|591", "BES|Bonaire, San Eustaquio y Saba|599",
  "BIH|Bosnia y Herzegovina|387", "BWA|Botsuana|267", "BRA|Brasil|55", "BRN|Brunéi|673", "BGR|Bulgaria|359",
  "BFA|Burkina Faso|226", "BDI|Burundi|257", "CPV|Cabo Verde|238", "KHM|Camboya|855", "CMR|Camerún|237", "CAN|Canadá|1",
  "QAT|Catar|974", "TCD|Chad|235", "CHL|Chile|56", "CHN|China|86", "CYP|Chipre|357", "VAT|Ciudad del Vaticano|39",
  "COL|Colombia|57", "COM|Comoras|269", "COG|Congo|242", "COD|Congo (Rep. Dem.)|243", "PRK|Corea del Norte|850",
  "KOR|Corea del Sur|82", "CIV|Costa de Marfil|225", "CRI|Costa Rica|506", "HRV|Croacia|385", "CUB|Cuba|53",
  "CUW|Curazao|599", "DNK|Dinamarca|45", "DMA|Dominica|1", "ECU|Ecuador|593", "EGY|Egipto|20", "SLV|El Salvador|503",
  "ARE|Emiratos Árabes Unidos|971", "ERI|Eritrea|291", "SVK|Eslovaquia|421", "SVN|Eslovenia|386", "ESP|España|34",
  "USA|Estados Unidos|1", "EST|Estonia|372", "SWZ|Esuatini|268", "ETH|Etiopía|251", "PHL|Filipinas|63",
  "FIN|Finlandia|358", "FJI|Fiyi|679", "FRA|Francia|33", "GAB|Gabón|241", "GMB|Gambia|220", "GEO|Georgia|995",
  "GHA|Ghana|233", "GIB|Gibraltar|350", "GRD|Granada|1", "GRC|Grecia|30", "GRL|Groenlandia|299", "GLP|Guadalupe|590",
  "GUM|Guam|1", "GTM|Guatemala|502", "GUF|Guayana Francesa|594", "GGY|Guernsey|44", "GIN|Guinea|224",
  "GNQ|Guinea Ecuatorial|240", "GNB|Guinea-Bisáu|245", "GUY|Guyana|592", "HTI|Haití|509", "HND|Honduras|504",
  "HKG|Hong Kong|852", "HUN|Hungría|36", "IND|India|91", "IDN|Indonesia|62", "IRQ|Irak|964", "IRN|Irán|98",
  "IRL|Irlanda|353", "IMN|Isla de Man|44", "ISL|Islandia|354", "CYM|Islas Caimán|1", "COK|Islas Cook|682",
  "FRO|Islas Feroe|298", "FLK|Islas Malvinas|500", "MNP|Islas Marianas del Norte|1", "MHL|Islas Marshall|692",
  "NFK|Isla Norfolk|672", "SLB|Islas Salomón|677", "TCA|Islas Turcas y Caicos|1", "VGB|Islas Vírgenes Británicas|1",
  "VIR|Islas Vírgenes de EE. UU.|1", "ISR|Israel|972", "ITA|Italia|39", "JAM|Jamaica|1", "JPN|Japón|81",
  "JEY|Jersey|44", "JOR|Jordania|962", "KAZ|Kazajistán|7", "KEN|Kenia|254", "KGZ|Kirguistán|996", "KIR|Kiribati|686",
  "XKX|Kosovo|383|USR", "KWT|Kuwait|965", "LAO|Laos|856", "LSO|Lesoto|266", "LVA|Letonia|371", "LBN|Líbano|961",
  "LBR|Liberia|231", "LBY|Libia|218", "LIE|Liechtenstein|423", "LTU|Lituania|370", "LUX|Luxemburgo|352",
  "MAC|Macao|853", "MKD|Macedonia del Norte|389", "MDG|Madagascar|261", "MYS|Malasia|60", "MWI|Malaui|265",
  "MDV|Maldivas|960", "MLI|Malí|223", "MLT|Malta|356", "MAR|Marruecos|212", "MTQ|Martinica|596", "MUS|Mauricio|230",
  "MRT|Mauritania|222", "MYT|Mayotte|262", "MEX|México|52", "FSM|Micronesia|691", "MDA|Moldavia|373", "MCO|Mónaco|377",
  "MNG|Mongolia|976", "MNE|Montenegro|382", "MSR|Montserrat|1", "MOZ|Mozambique|258", "MMR|Myanmar|95",
  "NAM|Namibia|264", "NRU|Nauru|674", "NPL|Nepal|977", "NIC|Nicaragua|505", "NER|Níger|227", "NGA|Nigeria|234",
  "NIU|Niue|683", "NOR|Noruega|47", "NCL|Nueva Caledonia|687", "NZL|Nueva Zelanda|64", "OMN|Omán|968",
  "NLD|Países Bajos|31", "PAK|Pakistán|92", "PLW|Palaos|680", "PSE|Palestina|970", "PAN|Panamá|507",
  "PNG|Papúa Nueva Guinea|675", "PRY|Paraguay|595", "PER|Perú|51", "PYF|Polinesia Francesa|689", "POL|Polonia|48",
  "PRT|Portugal|351", "PRI|Puerto Rico|1", "GBR|Reino Unido|44", "CAF|República Centroafricana|236",
  "CZE|República Checa|420", "DOM|República Dominicana|1", "REU|Reunión|262", "RWA|Ruanda|250", "ROU|Rumania|40",
  "RUS|Rusia|7", "WSM|Samoa|685", "ASM|Samoa Americana|1", "BLM|San Bartolomé|590", "KNA|San Cristóbal y Nieves|1",
  "SMR|San Marino|378", "MAF|San Martín (Francia)|590", "SPM|San Pedro y Miquelón|508",
  "VCT|San Vicente y las Granadinas|1", "SHN|Santa Elena y Tristán de Acuña|290", "LCA|Santa Lucía|1", "STP|Santo Tomé y Príncipe|239",
  "SEN|Senegal|221", "SRB|Serbia|381", "SYC|Seychelles|248", "SLE|Sierra Leona|232", "SGP|Singapur|65",
  "SXM|Sint Maarten|1", "SYR|Siria|963", "SOM|Somalia|252", "LKA|Sri Lanka|94", "ZAF|Sudáfrica|27", "SDN|Sudán|249",
  "SSD|Sudán del Sur|211", "SWE|Suecia|46", "CHE|Suiza|41", "SUR|Surinam|597", "THA|Tailandia|66", "TWN|Taiwán|886",
  "TZA|Tanzania|255", "TJK|Tayikistán|992", "TLS|Timor Oriental|670", "TGO|Togo|228", "TKL|Tokelau|690",
  "TON|Tonga|676", "TTO|Trinidad y Tobago|1", "TUN|Túnez|216", "TKM|Turkmenistán|993", "TUR|Turquía|90",
  "TUV|Tuvalu|688", "UKR|Ucrania|380", "UGA|Uganda|256", "URY|Uruguay|598", "UZB|Uzbekistán|998", "VUT|Vanuatu|678",
  "VEN|Venezuela|58", "VNM|Vietnam|84", "WLF|Wallis y Futuna|681", "YEM|Yemen|967", "DJI|Yibuti|253", "ZMB|Zambia|260",
  "ZWE|Zimbabue|263", "ALA|Åland|358", "CCK|Islas Cocos|61", "CXR|Isla de Navidad|61", "ESH|Sahara Occidental|212",
  "ATA|Antártida (bases)|672", "SJM|Svalbard y Jan Mayen|47", "IOT|Territorio Británico del Océano Índico (Diego García)|246",
  "PCN|Islas Pitcairn|64", "SGS|Georgias del Sur y Sandwich del Sur|500", "XAC|Ascensión (identificador interno)|247|USR:SHN",
];
