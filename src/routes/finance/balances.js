// @ts-nocheck
const CYCLE_MONTHS = { monthly: 1, quarterly: 3, 'half-yearly': 6, annually: 12 };
const toPaise = (amount) => Math.round(Number(amount) * 100);
const monthIndex = (date) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const monthKey = (index) => `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;

function applyPayout(loans, amount) {
	for (const field of ['due', 'accrued', 'principal']) {
		for (const loan of loans) {
			const applied = Math.min(loan[field], amount);
			loan[field] -= applied;
			amount -= applied;
			if (amount === 0) return 0;
		}
	}
	return amount;
}

export function monthlyBalances(entries, asOf) {
	const activity = new Map();
	let firstMonth = monthIndex(asOf);
	const lastMonth = firstMonth;
	const ordered = entries.filter((entry) => /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(entry.date) && entry.date <= asOf)
		.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

	for (const entry of ordered) {
		const month = monthIndex(entry.date);
		if (!activity.has(month)) activity.set(month, []);
		activity.get(month).push(entry);
		firstMonth = Math.min(firstMonth, month);
	}

	const parties = new Map();
	const months = [];
	let opening = 0;
	for (let index = firstMonth; index <= lastMonth; index++) {
		const month = monthKey(index);
		const lastDay = new Date(`${month}-01T00:00:00Z`);
		lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
		const daysInMonth = lastDay.getUTCDate();
		const throughDay = index === lastMonth ? Number(asOf.slice(8, 10)) : daysInMonth;
		let taken = 0;
		let payouts = 0;
		let interest = 0;
		let principal = 0;
		let outstandingInterest = 0;
		let due = 0;
		let credit = 0;

		const events = [];
		// Existing loans accrue first on a shared date, before any payments posted that day.
		for (const party of parties.values()) {
			for (const loan of party.loans) {
				const day = Math.min(loan.day, daysInMonth);
				if (day <= throughDay) events.push({ day, loan });
			}
		}
		for (const entry of activity.get(index) || []) events.push({ day: Number(entry.date.slice(8, 10)), entry });
		events.sort((a, b) => a.day - b.day);

		for (const { loan, entry } of events) {
			if (loan) {
				const earned = Math.round((loan.principal + loan.due) * loan.rate);
				interest += earned;
				loan.accrued += earned;
				if ((index - loan.start) % loan.cycle === 0) {
					loan.due += loan.accrued;
					loan.accrued = 0;
				}
				continue;
			}

			// Retain balances from older entries whose entities have been removed.
			const partyId = entry.entity_id ?? `removed-${entry.id}`;
			if (!parties.has(partyId)) parties.set(partyId, { loans: [], credit: 0 });
			const party = parties.get(partyId);
			const amount = toPaise(entry.amount);
			if (entry.entry_type === 'payout') {
				party.credit += applyPayout(party.loans, amount);
				payouts += amount;
			} else {
				party.loans.push({
					principal: amount, accrued: 0, due: 0,
					rate: Number(entry.interest_rate) / 100, start: index, day: Number(entry.date.slice(8, 10)),
					cycle: CYCLE_MONTHS[entry.interest_payout] || 1
				});
				if (party.credit) party.credit = applyPayout(party.loans, party.credit);
				taken += amount;
			}
		}
		for (const party of parties.values()) {
			party.loans = party.loans.filter((loan) => loan.principal || loan.accrued || loan.due);
			for (const loan of party.loans) {
				principal += loan.principal;
				outstandingInterest += loan.accrued + loan.due;
				due += loan.due;
			}
			credit += party.credit;
		}
		const owed = principal + outstandingInterest;
		months.push({ month, opening, taken, payouts, interest, principal, outstandingInterest, due, credit, owed });
		opening = owed;
	}
	return months.reverse();
}
