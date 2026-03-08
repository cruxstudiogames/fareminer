import { Router } from 'express';
import pool from '../services/database.js';

export const tripsRouter = Router();

tripsRouter.get('/', async (req, res) => {
  const userId = req.user!.id;
  const { rows: trips } = await pool.query(
    'SELECT id, trip_name, created_at, updated_at FROM trips WHERE user_id = $1 ORDER BY updated_at DESC',
    [userId]
  );
  res.json({ trips });
});

tripsRouter.get('/:id', async (req, res) => {
  const userId = req.user!.id;
  const { rows } = await pool.query(
    'SELECT * FROM trips WHERE id = $1 AND user_id = $2',
    [Number(req.params.id), userId]
  );
  const trip = rows[0];

  if (!trip) {
    res.status(404).json({ error: 'Trip not found' });
    return;
  }

  res.json({
    trip: {
      id: trip.id,
      tripName: trip.trip_name,
      columns: JSON.parse(trip.columns_json as string),
      columnOrder: JSON.parse(trip.column_order_json as string),
      items: JSON.parse(trip.items_json as string),
      createdAt: trip.created_at,
      updatedAt: trip.updated_at,
    },
  });
});

tripsRouter.post('/', async (req, res) => {
  const userId = req.user!.id;
  const { tripName, columns, columnOrder, items } = req.body;
  const now = new Date().toISOString();

  const { rows } = await pool.query(
    'INSERT INTO trips (user_id, trip_name, columns_json, column_order_json, items_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [
      userId,
      tripName || 'My Trip',
      JSON.stringify(columns || {}),
      JSON.stringify(columnOrder || []),
      JSON.stringify(items || {}),
      now,
      now,
    ]
  );

  res.status(201).json({ id: rows[0].id });
});

tripsRouter.put('/:id', async (req, res) => {
  const userId = req.user!.id;
  const tripId = Number(req.params.id);
  const { tripName, columns, columnOrder, items } = req.body;
  const now = new Date().toISOString();

  const { rowCount } = await pool.query(
    'UPDATE trips SET trip_name = $1, columns_json = $2, column_order_json = $3, items_json = $4, updated_at = $5 WHERE id = $6 AND user_id = $7',
    [
      tripName,
      JSON.stringify(columns),
      JSON.stringify(columnOrder),
      JSON.stringify(items),
      now,
      tripId,
      userId,
    ]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: 'Trip not found' });
    return;
  }

  res.json({ ok: true });
});

tripsRouter.delete('/:id', async (req, res) => {
  const userId = req.user!.id;
  const tripId = Number(req.params.id);

  const { rowCount } = await pool.query(
    'DELETE FROM trips WHERE id = $1 AND user_id = $2',
    [tripId, userId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: 'Trip not found' });
    return;
  }

  res.json({ ok: true });
});
