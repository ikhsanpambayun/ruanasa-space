import { applyTestEnv } from './test-env';

// Dijalankan Jest sebelum modul test di-import, karena ConfigModule.forRoot membaca env saat AppModule dievaluasi.
applyTestEnv();
