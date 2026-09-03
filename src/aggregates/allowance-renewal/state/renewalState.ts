import { createState } from '@/shared/rxstate';
import { type AllowanceRenewalStatus } from '../types';

const status$ = createState<AllowanceRenewalStatus>('idle');

export const allowanceRenewal = { status$ };
