CREATE OR REPLACE FUNCTION public._gen_device_token()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v text;
BEGIN
  v := encode(extensions.gen_random_bytes(32), 'base64');
  v := replace(replace(replace(v, '+', '-'), '/', '_'), '=', '');
  RETURN v;
END;
$function$;