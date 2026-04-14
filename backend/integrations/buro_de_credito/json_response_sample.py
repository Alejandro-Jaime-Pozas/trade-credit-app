json_response = """
  {
    "folioConsulta": "BCPM-20260130-00041872",
    "timestamp": "2026-01-30T19:12:44Z",
    "producto": {
      "id": "PM_REPORTE_COMPLETO_SCORE",
      "version": "1.0",
      "ambiente": "PROD"
    },
    "sujeto": {
      "tipoPersona": "M",
      "razonSocial": "DOMUS OFICINAS",
      "rfc": "DOF210419AQ6",
      "fechaConstitucion": "2020-05-10",
      "domicilios": [
        {
          "tipo": "FISCAL",
          "calle": "AV. INSURGENTES SUR 1234",
          "colonia": "DEL VALLE",
          "municipio": "BENITO JUAREZ",
          "estado": "CDMX",
          "cp": "03100",
          "pais": "MX"
        }
      ]
    },
    "resultado": {
      "codigo": "00",
      "descripcion": "CONSULTA EXITOSA"
    },

    "score": {
      "nombreScore": "SCORE_EMPRESA_BC",
      "valor": 742,
      "rango": { "min": 300, "max": 850 },
      "nivelRiesgo": "BAJO",
      "modelo": "BC-PM-Score-v3",
      "factoresClaves": [
        {
          "codigo": "F01",
          "descripcion": "Historial de pagos sin moras recientes"
        },
        {
          "codigo": "F03",
          "descripcion": "Baja utilización de líneas revolventes"
        },
        {
          "codigo": "F07",
          "descripcion": "Antigüedad adecuada de cuentas"
        }
      ]
    },

    "resumen": {
      "cuentasTotales": 3,
      "cuentasAbiertas": 3,
      "cuentasCerradas": 0,
      "morasUltimos12M": {
        "mopPeor": "01",
        "diasMoraMax": 0
      },
      "morasHistoricas": {
        "mopPeor": "01",
        "diasMoraMax": 0
      },
      "saldos": {
        "moneda": "MXN",
        "saldoTotalActual": 410000,
        "creditoTotalOtorgado": 1300000,
        "lineaRevolventeTotal": 500000,
        "utilizacionRevolventePct": 12
      },
      "consultas": {
        "ultimos3M": 1,
        "ultimos6M": 2,
        "ultimos12M": 2
      }
    },

    "cuentas": [
      {
        "idCuenta": "C001",
        "otorgante": {
          "clave": "BAN-0001",
          "nombre": "BANCO COMERCIAL",
          "sector": "BANCO"
        },
        "tipoContrato": "RE",
        "tipoCredito": "LINEA_CREDITO",
        "moneda": "MXN",
        "fechaApertura": "2022-08-15",
        "estatus": "ABIERTO",
        "montoOtorgado": 500000,
        "limiteCredito": 500000,
        "saldoActual": 60000,
        "pagoMinimo": 0,
        "formaPago": "M",
        "mopActual": "01",
        "historicoPagos": {
          "formato": "MOP24",
          "cadena24": "010101010101010101010101"
        },
        "garantia": { "tipo": "SIN_GARANTIA" }
      },
      {
        "idCuenta": "C002",
        "otorgante": {
          "clave": "BAN-0002",
          "nombre": "BANCO NACIONAL",
          "sector": "BANCO"
        },
        "tipoContrato": "PL",
        "tipoCredito": "CREDITO_SIMPLE",
        "moneda": "MXN",
        "fechaApertura": "2023-02-01",
        "estatus": "ABIERTO",
        "montoOtorgado": 800000,
        "plazoMeses": 36,
        "saldoActual": 350000,
        "pagoMensual": 29000,
        "formaPago": "M",
        "mopActual": "01",
        "historicoPagos": {
          "formato": "MOP24",
          "cadena24": "010101010101010101010101"
        },
        "garantia": { "tipo": "PRENDA", "descripcion": "EQUIPO/ACTIVO" }
      },
      {
        "idCuenta": "C003",
        "otorgante": {
          "clave": "NBFI-0107",
          "nombre": "ARRENDADORA",
          "sector": "SOFOM"
        },
        "tipoContrato": "LE",
        "tipoCredito": "LEASING",
        "moneda": "MXN",
        "fechaApertura": "2021-11-20",
        "estatus": "ABIERTO",
        "montoOtorgado": 0,
        "saldoActual": 0,
        "formaPago": "M",
        "mopActual": "01",
        "historicoPagos": {
          "formato": "MOP24",
          "cadena24": "010101010101010101010101"
        },
        "garantia": { "tipo": "ARRENDAMIENTO", "descripcion": "ACTIVO ARRENDADO" }
      }
    ],

    "consultasDetalle": [
      {
        "fecha": "2025-10-14",
        "otorgante": "BANCO COMERCIAL",
        "tipo": "OTORGAMIENTO",
        "productoSolicitado": "CREDITO_PYME"
      },
      {
        "fecha": "2025-07-03",
        "otorgante": "BANCO NACIONAL",
        "tipo": "REVISION",
        "productoSolicitado": "LINEA_CREDITO"
      }
    ],

    "mensajes": [
      {
        "tipo": "INFO",
        "codigo": "I100",
        "descripcion": "Sin claves de prevención/fraude asociadas al sujeto"
      }
    ],

    "anexoLender": {
      "nota": "Este bloque NO es típicamente parte del buró. Ejemplo de cómo un lender podría adjuntar/normalizar info financiera interna.",
      "finanzasAdjuntas": {
        "periodo": "2023",
        "moneda": "MXN",
        "revenue": 4455000,
        "netIncome": 1235000,
        "cashEnding": 1385000,
        "totalAssets": 2135000,
        "totalLiabilities": 600000,
        "totalEquity": 1535000
      }
    }
  }
"""
