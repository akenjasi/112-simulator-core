/**
 * Teacher V2 - Classifier Multi-search Autocomplete,
 * Ground Truth UI, Streaming UX, and Ticket Saving
 * Vanilla JavaScript Implementation
 */

(function () {
  function renderServicesList(services) {
    const container = document.getElementById("services_checkboxes_container");
    if (!container) return;
    container.innerHTML = "";
    if (!services || services.length === 0) {
      container.innerHTML = '<span style="color: var(--text-secondary); font-size: 13px;">Службы не определены</span>';
      return;
    }
    services.forEach(function (serviceName) {
      const label = document.createElement("label");
      label.style.display = "inline-flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      label.style.background = "rgba(255, 255, 255, 0.05)";
      label.style.border = "1px solid var(--border-color, #ccc)";
      label.style.padding = "4px 10px";
      label.style.borderRadius = "4px";
      label.style.cursor = "pointer";
      label.style.fontSize = "13px";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = serviceName;
      cb.checked = true;
      cb.className = "service-checkbox";

      const span = document.createElement("span");
      span.textContent = serviceName;

      label.appendChild(cb);
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  function calculateAndRenderServices(finalType) {
    if (!finalType) return;
    fetch("/api/classifier/calculate_services", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        final_type: finalType,
        has_victims: false
      })
    })
    .then(function (res) {
      if (!res.ok) {
        throw new Error("HTTP error " + res.status);
      }
      return res.json();
    })
    .then(function (data) {
      const services = data && data.services ? data.services : [];
      renderServicesList(services);
    })
    .catch(function (err) {
      console.error("Error calculating services:", err);
    });
  }

  function initClassifierAutocomplete() {
    const searchInput = document.getElementById("classifier_search");
    if (!searchInput) return;

    if (searchInput.dataset.v2Initialized === "true") return;
    searchInput.dataset.v2Initialized = "true";

    let dropdown = document.getElementById("classifier_dropdown");
    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.id = "classifier_dropdown";
      dropdown.className = "classifier-dropdown";
      dropdown.style.position = "absolute";
      dropdown.style.zIndex = "1000";
      dropdown.style.display = "none";
      if (searchInput.parentNode) {
        searchInput.parentNode.appendChild(dropdown);
      }
    } else {
      dropdown.style.position = "absolute";
      dropdown.style.zIndex = "1000";
    }

    let debounceTimer = null;

    function clearDropdown() {
      dropdown.innerHTML = "";
      dropdown.style.display = "none";
    }

    function hideDropdown() {
      dropdown.style.display = "none";
    }

    function renderDropdown(items) {
      dropdown.innerHTML = "";
      if (!items || items.length === 0) {
        clearDropdown();
        return;
      }

      // Limit results up to 15 items
      const limitedItems = items.slice(0, 15);

      limitedItems.forEach(function (record) {
        const itemEl = document.createElement("div");
        itemEl.className = "classifier-dropdown-item";
        itemEl.setAttribute("role", "button");
        itemEl.style.cursor = "pointer";

        const titleEl = document.createElement("div");
        titleEl.className = "item-title";
        titleEl.textContent = record.final_type || "";
        itemEl.appendChild(titleEl);

        const metaParts = [record.category, record.group, record.feature1].filter(Boolean);
        if (metaParts.length > 0) {
          const metaEl = document.createElement("div");
          metaEl.className = "item-sub";
          metaEl.textContent = metaParts.join(" • ");
          itemEl.appendChild(metaEl);
        }

        itemEl.addEventListener("click", function () {
          if (record && record.final_type) {
            searchInput.value = record.final_type;
            calculateAndRenderServices(record.final_type);
          }
          hideDropdown();
          window.selectedClassifierRecord = record;
        });

        dropdown.appendChild(itemEl);
      });

      dropdown.style.display = "block";
    }

    function fetchResults(query) {
      fetch("/api/v2/classifier/search?q=" + encodeURIComponent(query))
        .then(function (res) {
          if (!res.ok) {
            throw new Error("HTTP error " + res.status);
          }
          return res.json();
        })
        .then(function (data) {
          const results = data && data.results ? data.results : [];
          renderDropdown(results);
        })
        .catch(function (err) {
          console.error("Classifier search failed:", err);
          clearDropdown();
        });
    }

    searchInput.addEventListener("input", function (e) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      const query = (e.target.value || "").trim();

      // If query is empty or too short, clear dropdown without sending request
      if (!query || query.length < 2) {
        clearDropdown();
        return;
      }

      debounceTimer = setTimeout(function () {
        fetchResults(query);
      }, 300);
    });

    // Close dropdown on click outside
    document.addEventListener("click", function (e) {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        hideDropdown();
      }
    });

    // Close dropdown on Escape key
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        hideDropdown();
      }
    });
  }

  const DRAFT_PREFIX = "teacher_draft_";
  const markers = [
    "SM1", "SM2", "SD1", "SD2"
  ];
  const FACTOID_IDS = markers;

  function saveFieldValue(id, value) {
    try {
      localStorage.setItem(DRAFT_PREFIX + id, value);
      localStorage.setItem(id, value);
    } catch (e) {
      console.warn("Failed to save draft to localStorage:", e);
    }
  }

  function getSavedFieldValue(id) {
    try {
      const draftVal = localStorage.getItem(DRAFT_PREFIX + id);
      if (draftVal !== null) return draftVal;
      return localStorage.getItem(id);
    } catch (e) {
      return null;
    }
  }

  function initDraftAutosave() {
    const elements = new Set();
    document.querySelectorAll('[id^="gt_"]').forEach(function (el) {
      if (el.id) elements.add(el);
    });
    FACTOID_IDS.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) elements.add(el);
    });

    elements.forEach(function (el) {
      const savedVal = getSavedFieldValue(el.id);
      if (savedVal !== null) {
        el.value = savedVal;
      }

      el.addEventListener("input", function () {
        saveFieldValue(el.id, el.value);
      });
      el.addEventListener("change", function () {
        saveFieldValue(el.id, el.value);
      });
    });
  }

  let genTimerInterval = null;
  let genTimerStartTime = null;

  function formatTimer(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return "⏱ " + String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }

  function startGenTimer() {
    const timerEl = document.getElementById("gen_timer");
    if (timerEl) {
      timerEl.textContent = "⏱ 00:00";
    }
    genTimerStartTime = Date.now();
    if (genTimerInterval) {
      clearInterval(genTimerInterval);
    }
    genTimerInterval = setInterval(function () {
      if (!timerEl) return;
      const elapsedSeconds = Math.floor((Date.now() - genTimerStartTime) / 1000);
      timerEl.textContent = formatTimer(elapsedSeconds);
    }, 200);
  }

  function stopGenTimer() {
    if (genTimerInterval) {
      clearInterval(genTimerInterval);
      genTimerInterval = null;
    }
  }

  function initScenarioGenerator() {
    const generateBtn = document.getElementById("generate_scenario_btn");
    if (!generateBtn) return;

    const markers = [
      "SM1", "SM2", "SD1", "SD2"
    ];

    generateBtn.addEventListener("click", async function () {
      startGenTimer();
      window.onbeforeunload = function (e) {
        e.preventDefault();
        return "Идет генерация сценария. Вы уверены, что хотите покинуть страницу?";
      };

      const extraPlotInput = document.getElementById("gt_extra_plot") || document.getElementById("gt_plot");
      const extraPlot = extraPlotInput ? extraPlotInput.value : "";
      const plot = extraPlot;

      const groundTruth = {
        okrug: document.getElementById("gt_okrug") ? document.getElementById("gt_okrug").value : "",
        rayon: document.getElementById("gt_rayon") ? document.getElementById("gt_rayon").value : "",
        street: document.getElementById("gt_street") ? document.getElementById("gt_street").value : "",
        house: document.getElementById("gt_house") ? document.getElementById("gt_house").value : "",
        corpus: document.getElementById("gt_corpus") ? document.getElementById("gt_corpus").value : "",
        stroenie: document.getElementById("gt_stroenie") ? document.getElementById("gt_stroenie").value : "",
        flat: document.getElementById("gt_flat") ? document.getElementById("gt_flat").value : "",
        podiezd: document.getElementById("gt_podiezd") ? document.getElementById("gt_podiezd").value : "",
        floor: document.getElementById("gt_floor") ? document.getElementById("gt_floor").value : "",
        domofon: document.getElementById("gt_domofon") ? document.getElementById("gt_domofon").value : "",
        fio: document.getElementById("gt_fio") ? document.getElementById("gt_fio").value : "",
        phone: document.getElementById("gt_phone") ? document.getElementById("gt_phone").value : "",
        extra_plot: extraPlot
      };

      // Progressive UX: Lock all 14 textareas and show placeholder
      markers.forEach(function (markerId) {
        const el = document.getElementById(markerId);
        if (el) {
          el.value = "⏳ Генерация...";
          el.disabled = true;
        }
      });

      // Disable button during request to prevent double submissions
      generateBtn.disabled = true;

      const terminalEl = document.getElementById("ai_terminal_log");
      if (terminalEl) {
        terminalEl.innerHTML = "";
      }

      function appendToTerminal(htmlContent) {
        if (!terminalEl) return;
        const lineEl = document.createElement("div");
        lineEl.innerHTML = htmlContent;
        terminalEl.appendChild(lineEl);
        terminalEl.scrollTop = terminalEl.scrollHeight;
      }

      function escapeHtml(text) {
        if (!text) return "";
        return String(text)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      try {
        const payload = Object.assign({}, groundTruth, {
          plot: plot || extraPlot,
          extra_plot: extraPlot,
          ground_truth: groundTruth
        });

        const response = await fetch("/api/v2/generate_scenario_sse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error("HTTP error " + response.status);
        }

        if (!response.body) {
          throw new Error("ReadableStream not supported by response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        // Handles SSE blocks containing event: status, event: thought, event: factoid
        function processChunkBlock(block) {
          const trimmedBlock = block.trim();
          if (!trimmedBlock) return;

          let event = "";
          let dataStr = "";

          const lines = trimmedBlock.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith("event:") || line.startsWith("event: ")) {
              event = line.replace(/^event:\s*/, "").trim();
            } else if (line.startsWith("data:") || line.startsWith("data: ")) {
              dataStr = line.replace(/^data:\s*/, "");
            }
          }

          if (!dataStr) return;

          try {
            const data = JSON.parse(dataStr);
            if (event === "status") {
              const text = data && data.text !== undefined ? data.text : "";
              appendToTerminal("&gt; [STATUS] " + escapeHtml(text));
            } else if (event === "thought") {
              const text = data && data.text !== undefined ? data.text : "";
              appendToTerminal('<span style="color: #888">' + escapeHtml(text) + '</span>');
            } else if (event === "factoid" || (!event && data && data.marker)) {
              if (data && data.marker) {
                const marker = data.marker;
                const text = data.text !== undefined ? data.text : "";
                const targetEl = document.getElementById(marker);
                if (targetEl) {
                  targetEl.value = text;
                  targetEl.disabled = false;
                  saveFieldValue(marker, text);
                }
              }
            }
          } catch (jsonErr) {
            console.warn("Failed to parse SSE JSON payload:", jsonErr, dataStr);
          }
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop(); // Retain incomplete fragment for next iteration

          for (let i = 0; i < parts.length; i++) {
            processChunkBlock(parts[i]);
          }
        }

        // Process any remaining buffered chunk upon stream close
        buffer += decoder.decode();
        if (buffer.trim()) {
          const remainingParts = buffer.split("\n\n");
          for (let i = 0; i < remainingParts.length; i++) {
            processChunkBlock(remainingParts[i]);
          }
        }
      } catch (err) {
        console.error("Error generating scenario via SSE:", err);
      } finally {
        stopGenTimer();
        window.onbeforeunload = null;
        generateBtn.disabled = false;
        // Make sure all textareas are unlocked once generation finishes
        markers.forEach(function (markerId) {
          const el = document.getElementById(markerId);
          if (el && el.disabled) {
            el.disabled = false;
          }
        });
      }
    });
  }

  function initTicketSaver() {
    const saveBtn = document.getElementById("save_ticket_btn");
    if (!saveBtn) return;

    const markers = [
      "SM1", "SM2", "SD1", "SD2"
    ];

    saveBtn.addEventListener("click", async function () {
      const factoids = {};
      markers.forEach(function (m) {
        const el = document.getElementById(m);
        factoids[m] = el ? el.value : "";
      });

      const groundTruth = {
        okrug: document.getElementById("gt_okrug") ? document.getElementById("gt_okrug").value : "",
        rayon: document.getElementById("gt_rayon") ? document.getElementById("gt_rayon").value : "",
        street: document.getElementById("gt_street") ? document.getElementById("gt_street").value : "",
        house: document.getElementById("gt_house") ? document.getElementById("gt_house").value : "",
        corpus: document.getElementById("gt_corpus") ? document.getElementById("gt_corpus").value : "",
        stroenie: document.getElementById("gt_stroenie") ? document.getElementById("gt_stroenie").value : "",
        flat: document.getElementById("gt_flat") ? document.getElementById("gt_flat").value : "",
        podiezd: document.getElementById("gt_podiezd") ? document.getElementById("gt_podiezd").value : "",
        floor: document.getElementById("gt_floor") ? document.getElementById("gt_floor").value : "",
        domofon: document.getElementById("gt_domofon") ? document.getElementById("gt_domofon").value : "",
        fio: document.getElementById("gt_fio") ? document.getElementById("gt_fio").value : "",
        phone: document.getElementById("gt_phone") ? document.getElementById("gt_phone").value : "",
        extra_plot: document.getElementById("gt_extra_plot") ? document.getElementById("gt_extra_plot").value : ""
      };

      const searchInput = document.getElementById("classifier_search");
      const finalType = searchInput ? searchInput.value : "";

      const serviceCheckboxes = document.querySelectorAll("#services_checkboxes_container input.service-checkbox:checked");
      const services = Array.from(serviceCheckboxes).map(function (cb) { return cb.value; });

      saveBtn.disabled = true;
      const originalText = saveBtn.textContent;
      saveBtn.textContent = "Сохранение...";

      try {
        const response = await fetch("/api/v2/save_custom_ticket", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ground_truth: groundTruth,
            services: services,
            factoids: factoids,
            final_type: finalType,
            plot: (document.getElementById("gt_extra_plot") || document.getElementById("gt_plot")) ? (document.getElementById("gt_extra_plot") || document.getElementById("gt_plot")).value : ""
          })
        });

        if (!response.ok) {
          throw new Error("HTTP error " + response.status);
        }

        const resData = await response.json();
        alert("Билет успешно сохранен! ID: " + (resData.ticket_id || resData.id || ""));
      } catch (err) {
        console.error("Failed to save custom ticket:", err);
        alert("Ошибка при сохранении билета: " + err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    });
  }

  function initAll() {
    initClassifierAutocomplete();
    initScenarioGenerator();
    initTicketSaver();
    initDraftAutosave();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
