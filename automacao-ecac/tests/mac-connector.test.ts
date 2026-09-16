import { describe, expect, it } from 'vitest';
import { jobInput, tokenMatches } from '../src/mac/connector.js';
describe('Mac connector command boundaries',()=>{
 it('accepts only a valid numeric CNPJ and known operation',()=>{
  expect(jobInput.parse({cnpj:'51646813000194',operation:'coletar'})).toEqual({cnpj:'51646813000194',operation:'coletar'});
 });
 it.each([{cnpj:'11111111111111'},{cnpj:'51646813000194; open /'},{cnpj:'51646813000194',operation:'shell'}, {cnpj:'51646813000194',command:'rm -rf'}])('rejects malformed or arbitrary commands',value=>{
  expect(jobInput.safeParse(value).success).toBe(false);
 });
 it('requires an exact nonempty token',()=>{
  expect(tokenMatches('Bearer test','Bearer test')).toBe(true);
  expect(tokenMatches('Bearer wrong','Bearer test')).toBe(false);
  expect(tokenMatches('','')).toBe(false);
 });
});
