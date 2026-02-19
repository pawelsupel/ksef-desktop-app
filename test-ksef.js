const { kSeFService } = require('./src/backend/src/services/ksef.service.js');

(async () => {
  console.log('=== Testing KSeF Service ===');
  
  const initialized = await kSeFService.initialize();
  console.log('Initialized:', initialized);
  
  if (initialized) {
    console.log('\n=== Calling getReceivedInvoices ===');
    const invoices = await kSeFService.getReceivedInvoices(5, 0);
    console.log('Received invoices:', invoices.length);
  }
})();
