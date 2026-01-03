const { Sequelize } = require('sequelize');

// PostgreSQL live URL (ya environment variable se)
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false, // true karoge to SQL queries console me ayengi
    dialectOptions: {
        ssl: {
            require: true,       // SSL use karna agar hosting provider require karta ho
            rejectUnauthorized: false // For self-signed certs
        }
    }
});

// Test connection
async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log('Connection to PostgreSQL DB has been established successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
}

testConnection();

module.exports = sequelize;
