<script>
	// @ts-nocheck
	import TransactionLedger from '$lib/components/TransactionLedger.svelte';

	export let data;
</script>

<TransactionLedger kind="expense" company={data.company} />
