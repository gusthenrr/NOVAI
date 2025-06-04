"use client";
import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { io } from 'socket.io-client';
import CabecalhoOrganizado from "../componentesGerais/Header";

export default function Analytics(){
const router=useRouter()
const [id,setId]=useState()
return(
    <div>
    <h1>voce entrou</h1>
    </div>
)
}