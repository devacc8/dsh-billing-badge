window.__ModuleLoader__.load({
	id: "dsh-billing-badge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const react = require("react");

		/**
		 * dsh-billing-badge, browser half.
		 *
		 * Shows the current DeepSeek billing season and the account balance in the
		 * composer's statistics row, immediately after the native "Cache hit" pill,
		 * and opens a small panel with the full reading on click.
		 *
		 * The native row is not a slot the chip could be a sibling in, and the composer
		 * container is a column, so a sibling of the dock would land underneath instead
		 * of beside it. Up to 0.1.5 the row is one labelled component
		 * (`[data-composer-stats]`); from 0.1.6 the readings are pill buttons inside the
		 * composer dock. The slot registration below is therefore a mount point only:
		 * it renders nothing and appends the chip into whichever row `statsRow()`
		 * resolves. The data attribute and the slot name are deliberate, unlike the
		 * hashed class an earlier community plugin centred itself on (which collided
		 * with the model chip), and the chip is an ordinary flex child so it cannot
		 * overlap anything.
		 */

		// >>> billing-badge:season (generated from lib/season.js by scripts/inline-season.mjs) >>>
		/**
		 * Billing season logic for DeepSeek's time-of-day pricing.
		 *
		 * The rule is fixed and published: peak windows are Beijing time, Monday to
		 * Friday, 09:00-12:00 and 14:00-18:00. Everything else, including all of
		 * Saturday and Sunday, is off-peak and billed at half the peak price.
		 *
		 * Timezone handling: the rule is defined in Beijing time (UTC+8), so every
		 * calculation shifts the instant by a fixed offset and reads the UTC fields.
		 * Local timezones are never used for the decision, only for display.
		 *
		 * @module season
		 */
		
		/** Beijing time is UTC+8. */
		const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
		
		/** Peak windows in Beijing time, as [from, to) minutes after midnight. */
		const PEAK_WINDOWS = [
		  [9 * 60, 12 * 60],
		  [14 * 60, 18 * 60],
		];
		
		/** Candidate boundary minutes: midnight plus every window edge. */
		const BOUNDARY_MINUTES = [0, 9 * 60, 12 * 60, 14 * 60, 18 * 60];
		
		/** Milliseconds in a day, for candidate generation. */
		const DAY_MS = 24 * 60 * 60 * 1000;
		
		/**
		 * Whether an instant falls in a peak window (Beijing time, Monday to Friday).
		 *
		 * Weekend days return false before any window is tested. Comparing only the
		 * clock would report a peak window every Saturday and Sunday, six hours of
		 * false peak per week, which is the mistake this module exists to avoid.
		 *
		 * @param {Date} [at] - Instant to test, defaults to now.
		 * @returns {boolean} True when the instant is peak.
		 */
		function isPeak(at = new Date()) {
		  const beijing = new Date(at.getTime() + BEIJING_OFFSET_MS);
		  const day = beijing.getUTCDay();
		  if (day === 0 || day === 6) return false;
		  const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes();
		  return PEAK_WINDOWS.some(([from, to]) => minutes >= from && minutes < to);
		}
		
		/**
		 * Beijing midnight of the day that contains an instant, as an absolute time.
		 *
		 * @param {number} timeMs - Instant in milliseconds.
		 * @returns {number} The instant of Beijing midnight.
		 */
		function beijingMidnight(timeMs) {
		  const beijing = new Date(timeMs + BEIJING_OFFSET_MS);
		  return Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate()) - BEIJING_OFFSET_MS;
		}
		
		/**
		 * The next instant at which the season actually flips.
		 *
		 * Candidate boundaries are generated for the next ten days, then each is
		 * accepted only when the state one millisecond before it differs from the state
		 * at it. That filter is the point: Friday 18:00 ends the peak week, but the
		 * following boundary, Saturday 09:00, changes nothing because the whole weekend
		 * is already off-peak. Reporting it would show a countdown to an event that
		 * does not happen, so the honest answer is Monday 09:00.
		 *
		 * @param {Date} [at] - Instant to search from, defaults to now.
		 * @returns {number|null} Absolute time of the flip, or null when none is found.
		 */
		function nextFlip(at = new Date()) {
		  const from = at.getTime();
		  const midnight = beijingMidnight(from);
		  const candidates = [];
		  for (let day = 0; day <= 10; day += 1) {
		    const base = midnight + day * DAY_MS;
		    for (const minutes of BOUNDARY_MINUTES) candidates.push(base + minutes * 60 * 1000);
		  }
		  candidates.sort((a, b) => a - b);
		  for (const candidate of candidates) {
		    if (candidate <= from) continue;
		    if (isPeak(new Date(candidate)) !== isPeak(new Date(candidate - 1))) return candidate;
		  }
		  return null;
		}
		
		/**
		 * Remaining time until an instant, as a compact label.
		 *
		 * @param {number} ms - Milliseconds remaining.
		 * @returns {string} `2h13m`, `45m` or `38s`.
		 */
		function formatCountdown(ms) {
		  const total = Math.max(0, Math.floor(ms / 1000));
		  const hours = Math.floor(total / 3600);
		  const minutes = Math.floor((total % 3600) / 60);
		  const seconds = total % 60;
		  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m`;
		  if (minutes > 0) return `${minutes}m`;
		  return `${seconds}s`;
		}
		
		/**
		 * Beijing wall clock of an instant, for the popover.
		 *
		 * @param {Date} [at] - Instant to describe, defaults to now.
		 * @returns {{weekday: string, clock: string}} Weekday name and HH:MM.
		 */
		function beijingClock(at = new Date()) {
		  const beijing = new Date(at.getTime() + BEIJING_OFFSET_MS);
		  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		  const hh = String(beijing.getUTCHours()).padStart(2, '0');
		  const mm = String(beijing.getUTCMinutes()).padStart(2, '0');
		  return { weekday: weekdays[beijing.getUTCDay()], clock: `${hh}:${mm}` };
		}
		
		/**
		 * Everything the chip and its popover need for one instant.
		 *
		 * @param {Date} [at] - Instant to describe, defaults to now.
		 * @returns {object} Phase description.
		 */
		function describePhase(at = new Date()) {
		  const peak = isPeak(at);
		  const flip = nextFlip(at);
		  const remaining = flip === null ? null : flip - at.getTime();
		  const countdown = remaining === null ? '' : formatCountdown(remaining);
		  const { weekday, clock } = beijingClock(at);
		  const label = peak ? 'Peak' : 'Off-peak';
		  const compact = peak ? 'Peak' : 'Off-peak';
		  const nextLabel = peak ? 'Off-peak' : 'Peak';
		  return {
		    peak,
		    label,
		    compact,
		    countdown,
		    flipAt: flip,
		    remainingMs: remaining,
		    nextLabel,
		    beijing: { weekday, clock },
		    /** Single source of truth for the two state colors, used by chip and popover. */
		    color: peak ? '#D9A24A' : '#57C07C',
		    title: peak
		      ? `Peak billing until ${countdown} from now (${nextLabel} after that). Beijing time ${weekday} ${clock}.`
		      : `Off-peak billing, half price, for another ${countdown}. Beijing time ${weekday} ${clock}.`,
		  };
		}
		// <<< billing-badge:season <<<

		const NS = "billing-badge";
		const CSS_TAG_ID = "dsh-billing-badge/core.css";
		const HEADER = { "x-dsh-billing-badge": "1" };
		const BALANCE_URL = "/plugins/billing-badge/balance";
		const TICK_MS = 30 * 1000;
		const NARROW = "(max-width: 760px)";

		/** Styles copied from the native stats pill and panel so the chip reads as part of the row. */
		const CSS = `
.dsh-billing-badge {
  box-sizing: border-box; max-width: 100%;
  color: var(--dsw-alias-label-tertiary);
  font: inherit; font-variant-numeric: tabular-nums; line-height: inherit;
  white-space: nowrap; background: 0 0; border: none; border-radius: 24px;
  align-items: center; gap: 6px; padding: 1px 8px; display: inline-flex;
  cursor: pointer;
}
.dsh-billing-badge:hover, .dsh-billing-badge[aria-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-billing-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.dsh-billing-muted { opacity: .6; }
.dsh-billing-panel {
  position: fixed; z-index: 1100; box-sizing: border-box;
  background: var(--dsw-specific-menu);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-secondary);
  border: 0; border-radius: 12px; padding: 16px;
  font-size: 12px; line-height: 18px;
  min-width: min(300px, 100vw - 24px); max-width: min(420px, 100vw - 24px);
}
.dsh-billing-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.dsh-billing-title { font-weight: 500; color: var(--dsw-alias-label-primary); flex: 1; }
.dsh-billing-refresh {
  background: 0 0; border: none; padding: 0 2px; cursor: pointer;
  color: var(--dsw-alias-label-tertiary); font: inherit;
}
.dsh-billing-refresh:hover { color: var(--dsw-alias-label-primary); }
.dsh-billing-rows { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
.dsh-billing-rows dt { color: var(--dsw-alias-label-secondary); }
.dsh-billing-rows dd { margin: 0; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; text-align: right; }
.dsh-billing-note { margin-top: 10px; color: var(--dsw-alias-label-caption); }
.dsh-billing-note:empty { display: none; }
.dsh-billing-err { color: var(--dsw-alias-state-warn-label); }
`;

		/** Inject the stylesheet once per page. */
		function injectCss() {
			if (typeof document === "undefined") return;
			if (document.querySelector('style[data-plugin-css="' + CSS_TAG_ID + '"]') !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-billing-badge";
			tag.dataset.pluginCss = CSS_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		/** Format a money amount the way the API reports it: own currency, own precision. */
		function formatMoney(amount, currency) {
			if (typeof amount !== "number" || !Number.isFinite(amount)) return "--";
			const digits = amount >= 100 ? 2 : amount >= 1 ? 2 : 4;
			const symbol = currency === "CNY" ? "\u00a5" : currency === "USD" ? "$" : currency === "EUR" ? "\u20ac" : "";
			const text = amount.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
			return symbol === "" ? `${text} ${currency || ""}`.trim() : `${symbol}${text}`;
		}

		/** Read the balance through the plugin's own route. */
		async function loadBalance(refresh) {
			try {
				const response = await fetch(BALANCE_URL + (refresh ? "?refresh=1" : ""), { headers: HEADER });
				if (!response.ok) return { ok: false, state: "error", error: `HTTP ${response.status}` };
				return await response.json();
			} catch (err) {
				return { ok: false, state: "error", error: String((err && err.message) || err) };
			}
		}

		/** Build the panel body for one reading. */
		function panelBody(balance) {
			const phase = describePhase(new Date());
			const flip = phase.flipAt === null ? null : new Date(phase.flipAt);
			const rows = [
				["Billing season", phase.peak ? "Peak" : "Off-peak (half price)"],
				["Next switch", phase.countdown === "" ? "--" : `in ${phase.countdown}` + (flip === null ? "" : `, ${beijingClock(flip).weekday} ${beijingClock(flip).clock} Beijing`)],
				["Beijing time", `${phase.beijing.weekday} ${phase.beijing.clock}`],
			];
			if (balance && balance.ok) {
				rows.push(["Account balance", formatMoney(balance.total, balance.currency) + (balance.currency ? ` ${balance.currency}` : "")]);
				rows.push(["Granted", formatMoney(balance.granted, balance.currency)]);
				rows.push(["Topped up", formatMoney(balance.toppedUp, balance.currency)]);
				// `is_available` is true for every funded account, so it earns a row
				// only when the API says the balance is not enough for calls. A
				// permanent "allowed" row would be furniture.
				if (balance.isAvailable === false) {
					rows.push(["API calls", "insufficient balance", "warn"]);
				}
			} else if (balance && balance.state === "no-credential") {
				rows.push(["Account balance", "no API key configured"]);
			} else if (balance) {
				rows.push(["Account balance", "unavailable"]);
			}
			return rows;
		}

		/**
		 * The element the chip joins: the native statistics row, in either shape the
		 * harness has shipped it. Up to 0.1.5 it is a single labelled element; from
		 * 0.1.6 the readings are pill buttons in the composer dock, so the chip follows
		 * the pill that carries the cache-hit reading into the row that holds it.
		 *
		 * @returns {HTMLElement|null} Null while the row does not exist yet.
		 */
		function statsRow() {
			const legacy = document.querySelector('[data-composer-stats="true"]');
			if (legacy !== null) return legacy;
			const dock = document.querySelector('[data-slot="conversation.composer.dock"]');
			if (dock === null) return null;
			const reading = [...dock.querySelectorAll("button")].find((el) =>
				/cache hit/i.test(el.textContent || ""),
			);
			if (reading === undefined) return null;
			for (const child of dock.children) {
				if (child.contains(reading)) return child;
			}
			return null;
		}

		/**
		 * Mount the chip and its panel into the native statistics row.
		 *
		 * @param {HTMLElement} row - The native statistics row, from `statsRow()`.
		 * @returns {() => void} Teardown.
		 */
		function mountChip(row) {
			injectCss();

			const chip = document.createElement("button");
			chip.type = "button";
			chip.className = "dsh-billing-badge";
			chip.setAttribute("aria-haspopup", "dialog");
			chip.setAttribute("aria-expanded", "false");

			const dot = document.createElement("span");
			dot.className = "dsh-billing-dot";
			const label = document.createElement("span");
			const count = document.createElement("span");
			count.className = "dsh-billing-muted";
			chip.append(dot, label, count);

			let panel = null;
			let balance = null;
			let balanceLoaded = false;
			let tick = 0;

			const render = () => {
				const phase = describePhase(new Date());
				dot.style.background = phase.color;
				label.textContent = phase.compact;
				const narrow = typeof window !== "undefined" && window.matchMedia(NARROW).matches;
				count.textContent = narrow || phase.countdown === "" ? "" : "\u00b7 " + phase.countdown;
				chip.title = phase.title;
				if (panel !== null) fillPanel();
			};

			const fillPanel = () => {
				if (panel === null) return;
				const body = panel.querySelector(".dsh-billing-rows");
				const note = panel.querySelector(".dsh-billing-note");
				body.replaceChildren();
				for (const [key, value, tone] of panelBody(balance)) {
					const dt = document.createElement("dt");
					dt.textContent = key;
					const dd = document.createElement("dd");
					dd.textContent = value;
					if (tone === "warn") dd.style.color = "var(--dsw-alias-state-warn-label)";
					body.append(dt, dd);
				}
				note.textContent = balance && balance.ok === false && balance.error ? String(balance.error) : "";
				note.classList.toggle("dsh-billing-err", Boolean(balance && balance.ok === false));
			};

			const placePanel = () => {
				if (panel === null) return;
				const rect = chip.getBoundingClientRect();
				panel.style.visibility = "hidden";
				panel.style.left = "0px";
				panel.style.top = "0px";
				const width = panel.offsetWidth;
				const height = panel.offsetHeight;
				const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
				const above = rect.top - height - 8;
				panel.style.left = `${left}px`;
				panel.style.top = `${above >= 8 ? above : rect.bottom + 8}px`;
				panel.style.visibility = "";
			};

			const onDocumentPointer = (event) => {
				if (panel === null) return;
				if (panel.contains(event.target) || chip.contains(event.target)) return;
				closePanel();
			};
			const onKey = (event) => {
				if (event.key === "Escape") closePanel();
			};
			/**
			 * Follow the chip instead of dismissing the panel. The composer scrolls
			 * under the reader on its own while a turn renders, and closing on any
			 * scroll made the panel flicker away right after a click. A chip scrolled
			 * out of sight still closes, because a panel parked at the viewport edge
			 * no longer points at anything.
			 */
			let repositioning = false;
			const reposition = () => {
				if (panel === null) return;
				const rect = chip.getBoundingClientRect();
				if (rect.bottom < 0 || rect.top > window.innerHeight) {
					closePanel();
					return;
				}
				placePanel();
			};
			const onViewport = () => {
				if (panel === null || repositioning) return;
				repositioning = true;
				window.requestAnimationFrame(() => {
					repositioning = false;
					reposition();
				});
			};

			function closePanel() {
				if (panel === null) return;
				panel.remove();
				panel = null;
				chip.setAttribute("aria-expanded", "false");
				document.removeEventListener("pointerdown", onDocumentPointer, true);
				document.removeEventListener("keydown", onKey, true);
				window.removeEventListener("resize", onViewport);
				window.removeEventListener("scroll", onViewport, true);
			}

			async function openPanel() {
				if (panel !== null) return;
				panel = document.createElement("div");
				panel.className = "dsh-billing-panel";
				panel.setAttribute("role", "dialog");
				panel.setAttribute("aria-label", "Billing and balance");
				panel.innerHTML =
					'<div class="dsh-billing-head"><span class="dsh-billing-title">Billing and balance</span>' +
					'<button class="dsh-billing-refresh" type="button">Refresh</button></div>' +
					'<dl class="dsh-billing-rows"></dl>' +
					'<div class="dsh-billing-note"></div>';
				panel.querySelector(".dsh-billing-refresh").addEventListener("click", async () => {
					balance = await loadBalance(true);
					fillPanel();
				});
				document.body.appendChild(panel);
				chip.setAttribute("aria-expanded", "true");
				fillPanel();
				placePanel();
				document.addEventListener("pointerdown", onDocumentPointer, true);
				document.addEventListener("keydown", onKey, true);
				window.addEventListener("resize", onViewport);
				window.addEventListener("scroll", onViewport, true);
				if (!balanceLoaded) {
					balanceLoaded = true;
					balance = await loadBalance(false);
					fillPanel();
					placePanel();
				}
			}

			chip.addEventListener("click", () => {
				if (panel === null) void openPanel();
				else closePanel();
			});

			render();
			tick = window.setInterval(render, TICK_MS);

			row.appendChild(chip);

			return () => {
				window.clearInterval(tick);
				closePanel();
				chip.remove();
			};
		}

		/**
		 * Renderless slot occupant: its only job is to keep the chip attached to the
		 * native statistics row, re-attaching when React recreates that row.
		 */
		function BillingMount() {
			react.useEffect(() => {
				let teardown = null;
				let scheduled = false;

				const attach = () => {
					if (teardown !== null && document.querySelector(".dsh-billing-badge") !== null) return;
					const row = statsRow();
					if (row === null) return;
					if (teardown !== null) teardown();
					teardown = mountChip(row);
				};

				const schedule = () => {
					if (scheduled) return;
					scheduled = true;
					window.requestAnimationFrame(() => {
						scheduled = false;
						attach();
					});
				};

				attach();
				const observer = new MutationObserver(schedule);
				observer.observe(document.body, { childList: true, subtree: true });
				return () => {
					observer.disconnect();
					if (teardown !== null) teardown();
				};
			}, []);
			return null;
		}

		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("conversation.composer.dock", () =>
				ctx.slots.register(
					{ name: "conversation.composer.dock", id: "billing-badge", order: 10 },
					BillingMount,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__internal = { mountChip, panelBody, statsRow };
		return module.exports;
	},
});
