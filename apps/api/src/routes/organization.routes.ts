/**
 * /api/organization/*
 *
 * ORG:READ_TREE is held by every role — the org chart is not a secret. What
 * differs per actor is the CONTENT of each node, and that is serializeEmployee's
 * job, not this router's: an EMPLOYEE sees names, titles and structure, and
 * nobody else's salary.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import { orgTreeQuerySchema, type OrgTreeQuery } from '@playstack/shared';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateQuery } from '../middleware/validateQuery.js';
import * as organizationService from '../services/organization.service.js';
import { unauthorized } from '../lib/errors.js';
import type { Actor } from '../services/employee.serializer.js';

export const organizationRouter: Router = Router();

function actorOf(req: Request): Actor {
  if (req.user === undefined) throw unauthorized('Authentication required.');
  return { id: req.user.id, role: req.user.role };
}

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

organizationRouter.get(
  '/tree',
  authenticate,
  authorize('ORG:READ_TREE'),
  validateQuery(orgTreeQuerySchema),
  wrap(async (req, res) => {
    const actor = actorOf(req);
    const query = req.validatedQuery as OrgTreeQuery;
    const result = await organizationService.getTree(actor, {
      rootId: query.rootId,
      depth: query.depth,
    });
    res.status(200).json({ data: result.roots, orphanCount: result.orphanCount });
  }),
);
