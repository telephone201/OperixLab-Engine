import { phase11CommercialVerify } from '../src/services/projects/phase-11-commercial-verify';

phase11CommercialVerify.runFullSuite()
    .then(results => {
        console.log(JSON.stringify(results, null, 2));
        const failed = results.filter(r => r.status === 'FAIL');
        process.exit(failed.length > 0 ? 1 : 0);
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
