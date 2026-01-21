const express = require('express');
const { Pool } = require('pg');
const fetch = require('node-fetch'); // Asegúrate de tener node-fetch o usa el nativo en Node v18+

const app = express();
app.use(express.json());

// CONFIGURACIÓN DE CONEXIÓN
// NOTA: Reemplaza 'password' con tu contraseña real de la base de datos
const connectionString = 'postgresql://postgres.gzsqgsdxcxdycewmqgtw:parvuk-9gyhqu-zumRos@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false } // Necesario para conexiones SSL de Supabase
});

// ==========================================
// 1. SERVICIO DE REGISTRO
// Registra usuario y correo. Regresa el ID.
// ==========================================
app.post('/api/register', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'El email es obligatorio' });
    }

    try {
        const query = 'INSERT INTO users (email) VALUES ($1) RETURNING id';
        const result = await pool.query(query, [email]);

        res.status(201).json({
            message: 'Usuario registrado exitosamente',
            userId: result.rows[0].id
        });
    } catch (error) {
        console.error(error);
        if (error.code === '23505') { // Código de error de Postgres para valor duplicado
            return res.status(409).json({ error: 'El correo ya está registrado' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ==========================================
// 2. SERVICIO GENERADOR DE CÓDIGO
// Genera código de 8 dígitos, verifica email y llama webhook.
// ==========================================
app.post('/api/generate-code', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'El ID de usuario es obligatorio' });
    }

    try {
        // A. Generar código de 8 dígitos
        const code = Math.floor(10000000 + Math.random() * 90000000).toString();

        // B. Verificar que existe y actualizar (Atomic Update)
        const query = `
      UPDATE users 
      SET verification_code = $1 
      WHERE id = $2 
      RETURNING email
    `;
        const result = await pool.query(query, [code, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const userEmail = result.rows[0].email;

        // C. Consumir Webhook para enviar correo (Simulación)
        // En un caso real, aquí harías fetch('https://tu-servicio-de-email.com/send', ...)
        await mockEmailWebhook(userEmail, code);

        res.json({
            message: 'Código generado y enviado al webhook',
            info: 'Revisa la consola del servidor para ver el código simulado'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al generar código' });
    }
});

// Función auxiliar para simular el consumo del webhook
async function mockEmailWebhook(email, code) {
    console.log(`\n--- WEBHOOK CALL ---`);
    console.log(`Destino: ${email}`);
    console.log(`Payload: { code: "${code}" }`);
    console.log(`Enviando correo... OK`);
    console.log(`--------------------\n`);
    await fetch(`https://n8n.paas.oracle-mty1.juanlopez.dev/webhook/correo?email=${email}&code=${code}`)
}

// ==========================================
// 3. SERVICIO DE CONFIRMACIÓN
// Confirma con email y código.
// ==========================================
app.post('/api/confirm', async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
        return res.status(400).json({ error: 'Email y código son obligatorios' });
    }

    try {
        // Busca usuario con ese email y código.
        // Si encuentra, actualiza 'confirmed' a true.
        const query = `
      UPDATE users 
      SET confirmed = TRUE 
      WHERE email = $1 AND verification_code = $2 
      RETURNING id, confirmed
    `;

        const result = await pool.query(query, [email, code]);

        if (result.rows.length === 0) {
            return res.status(400).json({
                error: 'Falló la confirmación. El código es incorrecto o el email no coincide.'
            });
        }

        res.json({
            message: 'Cuenta confirmada exitosamente',
            status: 'confirmed'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al confirmar usuario' });
    }
});

// Iniciar servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servicios corriendo en http://localhost:${PORT}`);
});