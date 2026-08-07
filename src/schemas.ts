/**
 * Per-route request/response contracts published inside the x402 402 challenge.
 *
 * GENERATED FROM `public/openapi.json` — do not hand-edit. Run `npm run schemas`
 * after changing the OpenAPI document so the runtime challenge and the published
 * metadata cannot drift apart.
 *
 * The x402scan discovery spec requires every `accepts[]` entry to carry
 * `outputSchema.input` and `outputSchema.output`. Together they are how an agent
 * calls a route it has never seen before: `input` describes the request in the
 * x402 Bazaar `type: "http"` shape, and `output` is the JSON Schema of the 200
 * body the agent receives once it has paid. All `$ref`s are inlined, since a
 * client reading the challenge has not fetched the OpenAPI document.
 *
 * Keys match the paywall route map exactly:
 *   GET /search
 *   GET /availability/:campgroundId
 */

/**
 * One paid route's published request/response contract.
 *
 * Declared as a type alias rather than an interface so that it keeps an
 * implicit index signature and stays assignable to the paywall's
 * `outputSchema?: Record<string, unknown>`.
 */
export type RouteSchema = {
  /** How to call the route: method, path/query parameters or JSON body fields. */
  input: Record<string, unknown>;
  /** JSON Schema of the 200 response body. */
  output: Record<string, unknown>;
};

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "GET /search": {
    "input": {
      "type": "http",
      "method": "GET",
      "queryParams": {
        "query": {
          "type": "string"
        },
        "state": {
          "type": "string",
          "pattern": "^[A-Za-z]{2}$"
        },
        "latitude": {
          "type": "number"
        },
        "longitude": {
          "type": "number"
        },
        "radiusMiles": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500,
          "default": 50
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 50,
          "default": 10
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "source": {
          "enum": [
            "ridb",
            "fixture"
          ]
        },
        "query": {
          "type": "object"
        },
        "count": {
          "type": "integer"
        },
        "campgrounds": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "campgroundId": {
                "type": "string",
                "description": "recreation.gov facility id — pass to GET /availability/:campgroundId"
              },
              "name": {
                "type": "string"
              },
              "agency": {
                "type": "string"
              },
              "parkName": {
                "type": "string"
              },
              "state": {
                "type": "string"
              },
              "latitude": {
                "type": "number"
              },
              "longitude": {
                "type": "number"
              },
              "totalSites": {
                "type": "integer"
              },
              "reservable": {
                "type": "boolean"
              },
              "amenities": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "feePerNightUsd": {
                "type": [
                  "number",
                  "null"
                ],
                "description": "null from RIDB, which does not publish a single nightly fee on the facility record"
              },
              "description": {
                "type": "string"
              },
              "reservationUrl": {
                "type": "string",
                "format": "uri"
              }
            },
            "required": [
              "campgroundId",
              "name"
            ]
          }
        },
        "note": {
          "type": "string"
        },
        "retrievedAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "source",
        "campgrounds",
        "retrievedAt"
      ]
    }
  },
  "GET /availability/:campgroundId": {
    "input": {
      "type": "http",
      "method": "GET",
      "pathParams": {
        "campgroundId": {
          "type": "string",
          "pattern": "^\\d+$",
          "description": "Numeric recreation.gov facility id"
        }
      },
      "queryParams": {
        "startDate": {
          "type": "string",
          "format": "date",
          "description": "Defaults to today"
        },
        "endDate": {
          "type": "string",
          "format": "date",
          "description": "Defaults to startDate + 3; max 31 nights"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 300,
          "default": 50
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "source": {
          "enum": [
            "ridb",
            "fixture"
          ],
          "description": "Where the campground METADATA came from"
        },
        "availabilitySource": {
          "enum": [
            "recreation.gov",
            "fixture"
          ],
          "description": "Where the AVAILABILITY came from. Read this one before trusting the numbers."
        },
        "campgroundId": {
          "type": "string"
        },
        "campground": {
          "oneOf": [
            {
              "type": "object",
              "properties": {
                "campgroundId": {
                  "type": "string",
                  "description": "recreation.gov facility id — pass to GET /availability/:campgroundId"
                },
                "name": {
                  "type": "string"
                },
                "agency": {
                  "type": "string"
                },
                "parkName": {
                  "type": "string"
                },
                "state": {
                  "type": "string"
                },
                "latitude": {
                  "type": "number"
                },
                "longitude": {
                  "type": "number"
                },
                "totalSites": {
                  "type": "integer"
                },
                "reservable": {
                  "type": "boolean"
                },
                "amenities": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "feePerNightUsd": {
                  "type": [
                    "number",
                    "null"
                  ],
                  "description": "null from RIDB, which does not publish a single nightly fee on the facility record"
                },
                "description": {
                  "type": "string"
                },
                "reservationUrl": {
                  "type": "string",
                  "format": "uri"
                }
              },
              "required": [
                "campgroundId",
                "name"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "window": {
          "type": "object",
          "properties": {
            "startDate": {
              "type": "string",
              "format": "date"
            },
            "endDate": {
              "type": "string",
              "format": "date"
            },
            "nights": {
              "type": "integer"
            }
          }
        },
        "summary": {
          "type": "object",
          "properties": {
            "totalSites": {
              "type": "integer"
            },
            "sitesWithAnyAvailability": {
              "type": "integer"
            },
            "sitesAvailableWholeWindow": {
              "type": "integer"
            },
            "firstFullyAvailableDate": {
              "type": [
                "string",
                "null"
              ],
              "format": "date"
            }
          }
        },
        "sites": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "campsiteId": {
                "type": "string"
              },
              "site": {
                "type": "string"
              },
              "loop": {
                "type": "string"
              },
              "siteType": {
                "type": "string"
              },
              "reserveType": {
                "type": "string"
              },
              "nightsAvailable": {
                "type": "integer"
              },
              "fullWindowAvailable": {
                "type": "boolean"
              },
              "days": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "date": {
                      "type": "string",
                      "format": "date"
                    },
                    "status": {
                      "enum": [
                        "available",
                        "reserved",
                        "not-available",
                        "not-reservable",
                        "unknown"
                      ]
                    }
                  }
                }
              }
            },
            "required": [
              "campsiteId",
              "days",
              "nightsAvailable",
              "fullWindowAvailable"
            ]
          }
        },
        "bookingUrl": {
          "type": "string",
          "format": "uri"
        },
        "note": {
          "type": "string"
        },
        "retrievedAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "availabilitySource",
        "summary",
        "sites",
        "bookingUrl",
        "retrievedAt"
      ]
    }
  }
};
