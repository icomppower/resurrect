-- DATE RULE (checked Fri Nov 6 night): Billing Manager's default filter is form_encounter.date = "today" in
-- PHP's clock, which is UTC in this container (DB is UTC too). Encounter/billing dates are pinned to
-- CURDATE() 12:00 UTC at seed time, so a seed works for that whole UTC day: reseed any time after 4 PM PST
-- the day before (00:00 UTC) and it holds until 4 PM PST demo day. 10:45 AM PST Sat Nov 7 = 18:45 UTC Nov 7,
-- so seed Fri after 4 PM PST or Sat morning. Seeded on another UTC day? Reseed, or type From/To = seed date.
-- Resurrect spike: one deliberately incomplete patient/encounter/fee sheet so Validate emits many *** errors.
-- Fake data only. HCPCS Level II + ICD-10 codes only (no CPT).
INSERT INTO insurance_companies (id,name,attn,cms_id,ins_type_code,x12_receiver_id,x12_default_partner_id,alt_cms_id,inactive)
  VALUES (1,'Spike Health Plan','','',2,'',1,'',0);
INSERT INTO addresses (id,line1,line2,city,state,zip,plus_four,country,foreign_id)
  VALUES (1,'','','','','','','USA',1);
INSERT INTO x12_partners (id,name,id_number,x12_sender_id,x12_receiver_id,processing_format,x12_isa01,x12_isa02,x12_isa03,x12_isa04,x12_isa05,x12_isa07,x12_isa14,x12_isa15,x12_gs02,x12_per06,x12_dtp03)
  VALUES (1,'Spike Clearinghouse','123456789','SPIKESEND','SPIKERECV','standard','00','          ','00','          ','ZZ','ZZ','0','P','','','');
INSERT INTO patient_data (id,pid,pubpid,fname,lname,DOB,sex,street,city,state,postal_code,date,regdate,providerID)
  VALUES (1,1,'1','Test','Patient',NULL,'','','','','',(CURDATE() + INTERVAL 12 HOUR),CURDATE(),1);
INSERT INTO insurance_data (id,type,provider,plan_name,policy_number,group_number,subscriber_lname,subscriber_fname,subscriber_relationship,subscriber_DOB,subscriber_sex,subscriber_street,subscriber_city,subscriber_state,subscriber_postal_code,date,pid,accept_assignment,policy_type)
  VALUES (1,'primary','1','','','','','','self',NULL,'','','','','','2020-01-01',1,'TRUE','');
INSERT INTO form_encounter (id,date,reason,facility,facility_id,pid,encounter,onset_date,sensitivity,pc_catid,provider_id,billing_facility)
  VALUES (1,(CURDATE() + INTERVAL 12 HOUR),'Spike visit','Your Clinic Name Here',3,1,1,(CURDATE() + INTERVAL 12 HOUR),'normal',5,1,3);
INSERT INTO forms (id,date,encounter,form_name,form_id,pid,user,groupname,authorized,deleted,formdir)
  VALUES (1,(CURDATE() + INTERVAL 12 HOUR),1,'New Patient Encounter',1,1,'admin','Default',1,0,'newpatient');
INSERT INTO billing (date,code_type,code,pid,provider_id,user,groupname,authorized,encounter,code_text,billed,activity,payer_id,bill_process,modifier,units,fee,justify,x12_partner_id,ndc_info,notecodes) VALUES
  ((CURDATE() + INTERVAL 12 HOUR),'ICD10','Z00.00',1,1,1,'Default',1,1,'General adult medical exam',0,1,0,0,'',1,0,'',1,'',''),
  ((CURDATE() + INTERVAL 12 HOUR),'HCPCS','A0425',1,1,1,'Default',1,1,'Ground mileage',0,1,0,0,'',1,0,'',1,'',''),
  ((CURDATE() + INTERVAL 12 HOUR),'HCPCS','G0008',1,1,1,'Default',1,1,'Admin influenza vaccine',0,1,0,0,'',1,0,'',1,'','');
