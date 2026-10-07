<script>
	// @ts-nocheck
	import TransactionLedger from '$lib/components/TransactionLedger.svelte';

	export let data;
</script>

<TransactionLedger kind="income" company={data.company} />
